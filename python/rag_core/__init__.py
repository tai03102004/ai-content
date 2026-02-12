import logging
import threading
import concurrent.futures
from typing import List, Dict, Any, Set

import pybreaker
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    SparseVectorParams, SparseIndexParams, SparseVector
)

from .config import VECTOR_SIZE
from .clients import (
    init_embeddings, init_sparse_embeddings,
    init_qa_chain, init_qdrant, api_breaker,
    init_redis_bloom  
)
from .utils import (
    validate_collection_name, validate_question,
    calculate_adaptive_batch_size, batch_iterator
)
from .deduplication import deduplicate_batch
from .retrieval import hybrid_search
from .qa import get_cached_answer, cache_answer, generate_query_hash, build_context

logger = logging.getLogger("RAG_CORE")


class RAGCore:
    """Core RAG operations - Singleton"""
    _instance = None
    _lock = threading.Lock()
    
    def __init__(self):
        if hasattr(self, 'initialized') and self.initialized:
            return
        
        self.known_collections: Set[str] = set()
        self.collection_lock = threading.Lock()
        self._executor = None

        # Initialize Redis Bloom (optional - graceful fallback)
        self.bloom_available = init_redis_bloom()
        
        # Initialize clients
        self.embeddings = init_embeddings()
        self.sparse_model = init_sparse_embeddings()
        self.qa_chain = init_qa_chain()
        self.qdrant_client = init_qdrant()
        
        # Load existing collections
        cols = self.qdrant_client.get_collections()
        self.known_collections = {c.name for c in cols.collections}
        
        self.initialized = True
        logger.info(f"✅ RAGCore ready. Collections: {len(self.known_collections)}")

    @property
    def executor(self):
        if self._executor is None or self._executor._shutdown:
            self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)
        return self._executor

    def is_ready(self) -> bool:
        return self.qdrant_client is not None and self.embeddings is not None

    @api_breaker
    def _embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self.embeddings.embed_documents(texts)
    
    def _ensure_collection_exists(self, collection_name: str):
        """Ensure collection exists, create if not"""
        safe_name = validate_collection_name(collection_name)
        
        # Check if already known
        if safe_name in self.known_collections:
            return safe_name
        
        # Check Qdrant
        try:
            self.qdrant_client.get_collection(safe_name)
            self.known_collections.add(safe_name)
            logger.info(f"✅ Collection '{safe_name}' exists")
            return safe_name
        except Exception:
            pass  # Collection doesn't exist, create it
        
        # Create new collection
        logger.info(f"🆕 Creating collection: {safe_name}")
        
        self.qdrant_client.create_collection(
            collection_name=safe_name,
            vectors_config={
                "dense": VectorParams(
                    size=VECTOR_SIZE,
                    distance=Distance.COSINE
                )
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams(
                    index=SparseIndexParams(on_disk=False)
                )
            }
        )
        
        self.known_collections.add(safe_name)
        logger.info(f"✅ Collection '{safe_name}' created")
        return safe_name

    def add_documents_smart(self, collection_name: str, texts: List[str], metadatas: List[dict]):
        """Add documents with deduplication"""

        if not self.is_ready():
            raise ConnectionError("RAG Core not initialized")
        
        safe_name = self._ensure_collection_exists(collection_name)

        if not texts:
            logger.warning("⚠️ No texts to add")
            return 0
        
        total_upserted = 0
        batch_size = calculate_adaptive_batch_size(texts)

        all_ids = list(range(len(texts)))

        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            batch_metas = metadatas[i:i + batch_size]

            try:
                valid_texts, valid_metas, valid_ids = deduplicate_batch(
                    self.qdrant_client, batch_texts, batch_metas, safe_name
                )

                if not valid_texts:
                    logger.info(f"ℹ️ Batch {i//batch_size + 1}: All duplicates, skipping")
                    continue

                try:
                    dense_embeddings = self._embed_documents(valid_texts)
                    sparse_gen = self.sparse_model.embed(valid_texts)
                except pybreaker.CircuitBreakerError:
                    logger.error("⚡ Circuit Breaker OPEN")
                    break

                points = []
                for j, (text, meta, d_vec, s_res) in enumerate(zip(
                    valid_texts, valid_metas, dense_embeddings, sparse_gen
                )):
                    points.append(PointStruct(
                        id=valid_ids[j],
                        vector={
                            "dense": d_vec,
                            "sparse": SparseVector(
                                indices=s_res.indices.tolist(),
                                values=s_res.values.tolist()
                            )
                        },
                        payload={"page_content": text, "metadata": meta}
                    ))

                if points:
                    self.qdrant_client.upsert(collection_name=safe_name, points=points, wait=True)
                    total_upserted += len(points)
                    logger.info(f"✅ Batch {i//batch_size + 1}: Upserted {len(points)} chunks")

            except Exception as e:
                logger.error(f"❌ Batch fail: {e}")
                import traceback
                traceback.print_exc()
                continue

        logger.info(f"✅ Upserted {total_upserted} chunks -> {safe_name}")
        return total_upserted

    def retrieve_documents(
        self,
        query: str,
        collection_name: str,
        num_results: int = 5,
        score_threshold: float = 0.5
    ) -> List[Dict]:
        """Retrieve documents using hybrid search"""
        if not self.is_ready():
            return []

        safe_name = validate_collection_name(collection_name)
        if safe_name not in self.known_collections:
            return []

        return hybrid_search(
            self.qdrant_client,
            self.embeddings,
            self.sparse_model,
            query,
            safe_name,
            num_results,
            score_threshold
        )

    def answer_question(self, question: str, collection_name: str) -> Dict[str, Any]:
        """Answer question using RAG"""
        if not self.is_ready():
            return {'success': False, 'error': 'System Not Ready'}

        if not validate_question(question):
            return {'success': False, 'error': 'Invalid question'}
        
        safe_name = validate_collection_name(collection_name)

        if safe_name not in self.known_collections:
            # Try to refresh collection list
            try:
                cols = self.qdrant_client.get_collections()
                self.known_collections = {c.name for c in cols.collections}
            except Exception as e:
                return {'success': False, 'error': f'Cannot connect to Qdrant: {e}'}
            
            if safe_name not in self.known_collections:
                return {'success': False, 'error': f'Collection "{safe_name}" not found. Please upload documents first.'}


        # Check cache
        query_hash = generate_query_hash(question, collection_name)
        cached = get_cached_answer(query_hash)
        if cached:
            return {'success': True, 'answer': cached, 'sources': [], 'cached': True}

        try:
            docs = self.retrieve_documents(question, collection_name, num_results=5, score_threshold=0.45)

            if not docs:
                return {'success': False, 'answer': "Không tìm thấy thông tin phù hợp."}

            context_str = build_context(docs)
            logger.info(f"📝 Context length: {len(context_str)} chars")

            answer = self.qa_chain.invoke({"context": context_str, "question": question})
            logger.info(f"✅ Answer generated: {len(answer)} chars")
            
            cache_answer(query_hash, answer)
            
            return {
                'success': True,
                'answer': answer,
                'sources': list(set(d['source'] for d in docs))
            }

        except Exception as e:
            logger.error(f"❌ QA error: {e}")
            return {'success': False, 'error': str(e)}

    def cleanup(self):
        if self._executor:
            self._executor.shutdown(wait=False)


def get_rag_core() -> RAGCore:
    """Get singleton RAGCore instance"""
    if RAGCore._instance is None:
        with RAGCore._lock:
            if RAGCore._instance is None:
                RAGCore._instance = RAGCore()
    return RAGCore._instance