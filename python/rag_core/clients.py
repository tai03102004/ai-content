import os
import logging
import time
import redis
import pybreaker
from qdrant_client import QdrantClient
from fastembed import SparseTextEmbedding
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

from .config import (
    QDRANT_URL, QDRANT_API_KEY, EMBEDDING_BASE_URL, LLM_BASE_URL,
    EMBEDDING_MODEL, LLM_MODEL, QA_TEMPLATE
)

logger = logging.getLogger("RAG_CORE")

# Circuit Breaker
api_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)

# Redis Connection (từ env hoặc localhost)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

def get_redis_client():
    """Get Redis client with connection pooling"""
    try:
        client = redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception as e:
        logger.warning(f"⚠️ Redis not available: {e}")
        return None

r = get_redis_client()


def init_redis_bloom():
    """Initialize Bloom Filter for deduplication"""
    if r is None:
        logger.warning("⚠️ Redis not available, skipping Bloom Filter")
        return False
    
    try:
        # Check if RedisBloom module exists
        r.execute_command('BF.RESERVE', 'rag_dedup', 0.01, 1000000)
        logger.info("✅ Bloom Filter initialized")
        return True
    except redis.exceptions.ResponseError as e:
        if "already exists" in str(e).lower():
            logger.info("ℹ️ Bloom Filter already exists")
            return True
        elif "unknown command" in str(e).lower():
            logger.warning("⚠️ RedisBloom module not installed. Using Qdrant-only dedup.")
            return False
        else:
            logger.error(f"❌ Bloom Filter error: {e}")
            return False


def is_bloom_available() -> bool:
    """Check if Bloom Filter is available"""
    if r is None:
        return False
    try:
        r.execute_command('BF.EXISTS', 'rag_dedup', 'test')
        return True
    except:
        return False


# ... existing init functions ...

def init_embeddings() -> OpenAIEmbeddings:
    """Initialize OpenAI Embeddings"""
    emb_key = os.getenv("RAG_EMBEDDING_API_KEY")
    if not emb_key:
        raise ValueError("Missing RAG_EMBEDDING_API_KEY")
    
    return OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=emb_key,
        base_url=EMBEDDING_BASE_URL,
        max_retries=3,
        timeout=30
    )


def init_sparse_embeddings() -> SparseTextEmbedding:
    """Initialize BM25 Sparse Embeddings"""
    return SparseTextEmbedding(model_name="Qdrant/bm25")


def init_qa_chain():
    """Initialize QA Chain with LLM"""
    llm_key = os.getenv("RAG_OPEN_AI")
    if not llm_key:
        raise ValueError("Missing RAG_OPEN_AI")
    
    llm = ChatOpenAI(
        model=LLM_MODEL,
        temperature=0.1,
        api_key=llm_key,
        base_url=LLM_BASE_URL,
        timeout=45,
        max_retries=2
    )
    return QA_TEMPLATE | llm | StrOutputParser()


def init_qdrant() -> QdrantClient:
    """Initialize Qdrant Client"""
    url = QDRANT_URL
    api_key = QDRANT_API_KEY
    
    if not url or not api_key:
        raise ValueError("❌ QDRANT_URL or QDRANT_API_KEY missing")
    
    logger.info(f"🔌 Connecting to Qdrant...")
    
    client = QdrantClient(
        url=url,
        api_key=api_key,
        timeout=30
    )
    
    # Test connection
    collections = client.get_collections()
    logger.info(f"✅ Qdrant Connected. Collections: {len(collections.collections)}")
    return client