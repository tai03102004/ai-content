import logging
from typing import List, Dict

from qdrant_client.models import SparseVector, Prefetch
from qdrant_client.http import models as rest_models

logger = logging.getLogger("RAG_CORE")


def hybrid_search(
    qdrant_client,
    embeddings,
    sparse_model,
    query: str,
    collection_name: str,
    num_results: int = 5,
    score_threshold: float = 0.5
) -> List[Dict]:
    """Hybrid search with dense + sparse vectors"""
    try:
        # Dense embedding
        dense_query = embeddings.embed_query(query)
        logger.info(f"✅ Dense embedding: {len(dense_query)} dims")
        
        # Sparse embedding
        sparse_result = list(sparse_model.query_embed(query))[0]
        sparse_query = SparseVector(
            indices=sparse_result.indices.tolist(),
            values=sparse_result.values.tolist()
        )
        logger.info(f"✅ Sparse embedding: {len(sparse_result.indices)} terms")
        
        # Prefetch for RRF fusion
        prefetch = [
            Prefetch(
                query=dense_query,
                using="dense",
                limit=num_results * 2,
                score_threshold=score_threshold
            ),
            Prefetch(
                query=sparse_query,
                using="sparse",
                limit=num_results * 2,
            ),
        ]
        
        results = qdrant_client.query_points(
            collection_name=collection_name,
            prefetch=prefetch,
            query=rest_models.FusionQuery(fusion=rest_models.Fusion.RRF),
            limit=num_results,
        ).points

        logger.info(f"✅ Found {len(results)} results")
        
        return [{
            'content': hit.payload.get('page_content'),
            'source': hit.payload.get('metadata', {}).get('source', 'Unknown'),
            'score': hit.score
        } for hit in results]
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        return []