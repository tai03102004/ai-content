"""
Core RAG functionality shared between Streamlit UI and Flask API
"""

import os
import logging
import concurrent.futures
from typing import List, Optional, Dict, Any
from functools import lru_cache
import threading
import re
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from langchain_chroma import Chroma
import chromadb
from chromadb.errors import ChromaError
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)

logger = logging.getLogger("RAG_CORE")

# Constants
CHROMA_SERVER_HOST = os.getenv("CHROMA_SERVER_HOST", "localhost")
CHROMA_SERVER_PORT = int(os.getenv("CHROMA_SERVER_PORT", 8000))
CHROMA_AUTH_TOKEN = os.getenv("CHROMA_AUTH_TOKEN")

# API & Model Config
EMBEDDING_BASE_URL = "https://api.yescale.io/v1"
LLM_BASE_URL = "https://api.yescale.io/v1"
EMBEDDING_MODEL = "text-embedding-3-small"
LLM_MODEL = "o4-mini-2025-04-16"


HYDE_TEMPLATE = PromptTemplate.from_template(
    """Write a dense, keyword-rich paragraph (100 words) answering: {query}."""
)

QA_TEMPLATE = ChatPromptTemplate.from_template(
    """Based on the context below, answer the question.
    - Cite sources as [1], [2].
    - Answer in the same language as the question.
    
    Context: {context}
    Question: {question}
    Answer:"""
)

class RAGCore:
    """Core RAG operations for document retrieval and question answering"""
    _lock = threading.Lock()
    
    def __init__(self):
        self.chroma_auth_settings = chromadb.Settings(
            anonymized_telemetry=False
        )
        self.vector_dbs: Dict[str, Chroma] = {} 
        self.embeddings = None

        self.hyde_chain = None
        self.qa_chain = None

        self.global_chroma_client = None
        
        self._init_clients()

    def _init_clients(self):
        """Khởi tạo API Clients một lần duy nhất"""
        emb_key = os.getenv("RAG_EMBEDDING_API_KEY")
        llm_key = os.getenv("RAG_OPEN_AI")
        
        if not emb_key or not llm_key:
            raise ValueError("❌ Missing API Keys")

        self.embeddings = OpenAIEmbeddings(
            model=EMBEDDING_MODEL,
            api_key=emb_key, 
            base_url=EMBEDDING_BASE_URL,
            chunk_size=500,
            max_retries=3,
            timeout=30
        )
        
        hyde_llm = ChatOpenAI(
            model=LLM_MODEL, temperature=0.3, api_key=llm_key, 
            base_url=LLM_BASE_URL, max_tokens=500, timeout=15, max_retries=3
        )

        self.hyde_chain = HYDE_TEMPLATE | hyde_llm | StrOutputParser()
        
        qa_llm = ChatOpenAI(
            model=LLM_MODEL, temperature=0.1, api_key=llm_key, 
            base_url=LLM_BASE_URL, timeout=45, max_retries=3
        )
        self.qa_chain = QA_TEMPLATE | qa_llm | StrOutputParser()

        try:
            logger.info(f"🔌 Connecting to ChromaDB at {CHROMA_SERVER_HOST}:{CHROMA_SERVER_PORT}...")
            headers = {}
            if CHROMA_AUTH_TOKEN:
                headers["Authorization"] = f"Bearer {CHROMA_AUTH_TOKEN}"
            
            self.global_chroma_client = chromadb.HttpClient(
                host=CHROMA_SERVER_HOST, 
                port=CHROMA_SERVER_PORT,
                settings=chromadb.Settings(anonymized_telemetry=False),
                headers=headers if headers else None
            )
            self.global_chroma_client.heartbeat()
            logger.info("✅ Connected to ChromaDB Server (Shared Client Ready)")
        except Exception as e:
            logger.error(f"❌ CRITICAL: Cannot connect to ChromaDB Server: {e}")
            self.global_chroma_client = None
    
    def _validate_collection_name(self, name: str) -> str:
        """Sanitize collection name to prevent DB errors"""
        clean_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
        if 3 <= len(clean_name) <= 63:
            return clean_name
        raise ValueError(f"Invalid collection name: {name}. Must be 3-63 chars, alphanumeric.")
        
    def get_vector_db(self, collection_name: str) -> Chroma:
        safe_name = self._validate_collection_name(collection_name)
        if safe_name not in self.vector_dbs:
            with self._lock: 
                if safe_name not in self.vector_dbs:
                    if not self.global_chroma_client:
                        logger.error("Global Chroma Client is not ready!")
                        raise ConnectionError("Database disconnected")
                    
                    logger.info(f"🔌 Connecting to collection: {collection_name}")
                    
                    self.vector_dbs[safe_name] = Chroma(
                        client_settings=self.chroma_auth_settings,
                        collection_name=safe_name,
                        embedding_function=self.embeddings,
                        client=self.global_chroma_client
                    )
        return self.vector_dbs[collection_name]
    
    def is_ready(self) -> bool:
        return self.embeddings is not None and self.qa_chain is not None and self.global_chroma_client is not None
    
    @lru_cache(maxsize=100)
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def _generate_hypothetical_document(self, query: str) -> str:
        if not self.hyde_chain: return query
        return self.hyde_chain.invoke({"query": query})
    
    @retry(
        stop=stop_after_attempt(3), 
        wait=wait_exponential(multiplier=0.5, min=1, max=5),
        retry=retry_if_exception_type((ConnectionError, ChromaError))
    )
    def _execute_search(self, db, query, k, search_type, fetch_k=None, lambda_mult=None):
        """Unified search with retry logic"""
        if search_type == "mmr":
            return db.max_marginal_relevance_search(
                query=query,
                k=k,
                fetch_k=fetch_k or k * 4,
                lambda_mult=lambda_mult or 0.6
            )
        else:
            return db.similarity_search(query, k=k)

    def retrieve_documents(
        self, 
        query: str, 
        collection_name: str,
        num_results: int = 5,
        use_hyde: bool = True,
        search_type: str = "mmr"
    ) -> List[Dict[str, Any]]:
        if not self.is_ready(): return []

        try:
            db = self.get_vector_db(collection_name)
        except Exception as e:
            logger.error(f"❌ Failed to get DB collection {collection_name}: {e}")
            return []
        
        search_query = query

        if use_hyde and len(query.split()) > 4:
            try:
                search_query = self._generate_hypothetical_document(query)
            except Exception as e:
                logger.warning(f"HyDE failed after retries: {e}. Using raw query.")
        
        try: 
            if search_type == "mmr":
                docs = self._execute_search(
                    db=db, query=search_query, k=num_results, search_type="mmr",
                    fetch_k=num_results * 4, lambda_mult=0.6
                )

            else:
                docs = self._execute_search(
                    db=db, query=search_query, k=num_results, search_type="similarity"
                )
            return [{
                'content': d.page_content,
                'metadata': d.metadata,
                'source': d.metadata.get('source', 'Unknown')
            } for d in docs]

        except Exception as e:
            logger.error(f"❌ Retrieval failed: {e}")
            return []
                
    def answer_question(
        self, 
        question: str, 
        collection_name: str,
        context_size: int = 5
    ) -> Dict[str, Any]:
        if not self.is_ready(): return {'success': False, 'error': 'DB Not Ready'}
        
        try:
            # Get context documents
            docs = self.retrieve_documents(
                query=question, 
                collection_name=collection_name, 
                num_results=context_size, 
                use_hyde=True
            )
            if not docs: 
                return {'success': False, 'answer': "No info found."}

            context_str = "\n\n".join([f"[{i+1}] {d['content']}" for i, d in enumerate(docs)])

            answer = self.qa_chain.invoke({
                "context": context_str, "question": question
            })
            
            return {
                'success': True, 
                'answer': answer, 
                'sources': [d['source'] for d in docs]
            }
            
        except Exception as e:
            logger.error(f"❌ Answer generation error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    def extract_by_keywords(
        self,
        primary_keywords: List[str],
        collection_name: str,
        secondary_keywords: List[str] = None,
        context_size: int = 5
    ) -> Dict[str, Any]:
        if not self.is_ready():
            return {'success': False, 'error': 'Vector DB not loaded'}
        
        secondary_keywords = secondary_keywords or []
        
        results = {'primary_keywords': {}, 'secondary_keywords': {}, 'success': True}
        all_kws = list(set(primary_keywords + secondary_keywords))

        def fetch_task(kw):
            try:
                data = self.retrieve_documents(
                    query=kw, 
                    collection_name=collection_name, 
                    num_results=context_size, 
                    use_hyde=False, 
                    search_type="mmr"
                )
                return kw, data
            except Exception as e:
                logger.error(f"Worker failed for '{kw}': {e}")
                return kw, []
        
        max_workers = min(15, len(all_kws) + 2)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_kw = {executor.submit(fetch_task, kw): kw for kw in all_kws}
            
            for future in concurrent.futures.as_completed(future_to_kw):
                kw, docs = future.result()
                if not docs: continue
                
                data = {
                    'content': "\n\n".join([d['content'] for d in docs]), 
                    'sources': [d['source'] for d in docs],
                    'num_docs': len(docs)
                }
                
                if kw in primary_keywords: results['primary_keywords'][kw] = data
                elif kw in secondary_keywords: results['secondary_keywords'][kw] = data
        
        return results

# Singleton instance
_instance = None
_instance_lock = threading.Lock()

def get_rag_core() -> RAGCore:
    global _instance
    if _instance is None:
        with _instance_lock: 
            if _instance is None:
                _instance = RAGCore()
    return _instance