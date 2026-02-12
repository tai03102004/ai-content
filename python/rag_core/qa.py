import hashlib
import logging
from typing import Dict, Any, Optional

from .clients import r

logger = logging.getLogger("RAG_CORE")


def get_cached_answer(query_hash: str) -> Optional[str]:
    """Check Redis cache for previous answers"""
    try:
        cached = r.get(f"ans:{query_hash}")
        if cached:
            logger.info("🎯 Cache HIT")
        return cached
    except Exception:
        return None


def cache_answer(query_hash: str, answer: str, ttl: int = 3600):
    """Cache answer in Redis"""
    try:
        r.setex(f"ans:{query_hash}", ttl, answer)
        logger.info(f"💾 Cached (TTL: {ttl}s)")
    except Exception as e:
        logger.warning(f"Cache write failed: {e}")


def generate_query_hash(question: str, collection_name: str) -> str:
    """Generate hash for cache key"""
    return hashlib.md5(f"{question}:{collection_name}".encode()).hexdigest()


def build_context(docs: list) -> str:
    """Build context string from documents"""
    return "\n\n".join([
        f"Source: {d['source']}\nContent: {d['content']}"
        for d in docs
    ])