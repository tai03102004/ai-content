import logging
from typing import List, Tuple

from .utils import generate_deterministic_id
from .clients import r, is_bloom_available

logger = logging.getLogger("RAG_CORE")


def check_bloom_filter(item_id: str) -> bool:
    """Check if ID exists in Bloom Filter"""
    if not is_bloom_available():
        return False  # Skip bloom, use Qdrant
    try:
        return r.execute_command('BF.EXISTS', 'rag_dedup', item_id) == 1
    except:
        return False


def add_to_bloom_filter(item_id: str):
    """Add ID to Bloom Filter"""
    if not is_bloom_available():
        return
    try:
        r.execute_command('BF.ADD', 'rag_dedup', item_id)
    except:
        pass


def deduplicate_batch(
    qdrant_client,
    texts: List[str],
    metas: List[dict],
    collection_name: str
) -> Tuple[List[str], List[dict], List[str]]:
    """
    Filter duplicates using:
    1. Bloom Filter (fast, O(1)) - if available
    2. Qdrant fallback (accurate)
    """
    valid_texts, valid_metas, valid_ids = [], [], []
    use_bloom = is_bloom_available()
    
    # Generate all IDs first
    all_ids = [generate_deterministic_id(text, meta) for text, meta in zip(texts, metas)]
    
    if use_bloom:
        logger.info("🔵 Using Bloom Filter + Qdrant hybrid dedup")
        
        for text, meta, p_id in zip(texts, metas, all_ids):
            # Fast Bloom check first
            if not check_bloom_filter(p_id):
                # Definitely new
                add_to_bloom_filter(p_id)
                valid_texts.append(text)
                valid_metas.append(meta)
                valid_ids.append(p_id)
            else:
                # Possible false positive - verify with Qdrant
                if not _check_qdrant_exists(qdrant_client, p_id, collection_name):
                    add_to_bloom_filter(p_id)
                    valid_texts.append(text)
                    valid_metas.append(meta)
                    valid_ids.append(p_id)
    else:
        logger.info("🟡 Using Qdrant-only dedup (Bloom Filter not available)")
        
        # Batch check in Qdrant
        existing_ids = set()
        try:
            existing = qdrant_client.retrieve(
                collection_name=collection_name,
                ids=all_ids,
                with_payload=False,
                with_vectors=False
            )
            existing_ids = {str(p.id) for p in existing}
        except Exception:
            pass  # New collection
        
        for text, meta, p_id in zip(texts, metas, all_ids):
            if p_id not in existing_ids:
                valid_texts.append(text)
                valid_metas.append(meta)
                valid_ids.append(p_id)
    
    removed = len(texts) - len(valid_texts)
    logger.info(f"📊 Dedup: {len(texts)} -> {len(valid_texts)} (removed {removed})")
    
    return valid_texts, valid_metas, valid_ids


def _check_qdrant_exists(qdrant_client, item_id: str, collection_name: str) -> bool:
    """Verify ID exists in Qdrant"""
    try:
        res = qdrant_client.retrieve(
            collection_name=collection_name,
            ids=[item_id],
            with_payload=False,
            with_vectors=False
        )
        return len(res) > 0
    except:
        return False