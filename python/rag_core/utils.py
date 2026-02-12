import re
import hashlib
import uuid
from typing import List
from itertools import islice

from .config import BLOCKLISTED_NAMES


def validate_collection_name(name: str) -> str:
    """Validate and sanitize collection name"""
    # Clean special characters
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', name.lower())
    
    # Check blocklist
    if any(blocked in clean for blocked in BLOCKLISTED_NAMES):
        clean = f"user_{clean}"
    
    # Limit length
    clean = clean[:59]
    
    # Ensure minimum length
    return clean if len(clean) >= 3 else "default_collection"


def validate_question(question: str) -> bool:
    """Validate question input for security"""
    if len(question) > 1000 or len(question.strip()) < 2:
        return False
    
    suspicious_patterns = [
        r'exec\(', r'eval\(', r'__import__', r'subprocess',
        r'<script>', r'javascript:', r'onload='
    ]
    
    for pattern in suspicious_patterns:
        if re.search(pattern, question, re.IGNORECASE):
            return False
    
    return True


def generate_deterministic_id(content: str, metadata: dict) -> str:
    """Generate consistent ID for deduplication"""
    source = metadata.get("source", "unknown")
    page = str(metadata.get("page", ""))
    raw_str = f"{source}::{page}::{content}"
    return str(uuid.UUID(hex=hashlib.md5(raw_str.encode()).hexdigest()))


def calculate_adaptive_batch_size(texts: List[str]) -> int:
    """Calculate batch size based on text length"""
    avg_tokens = sum(len(t.split()) for t in texts) / len(texts)
    
    if avg_tokens > 500:
        return 20
    elif avg_tokens > 200:
        return 30
    return 50


def batch_iterator(iterable, size: int):
    """Yield batches from iterable"""
    it = iter(iterable)
    while True:
        batch = list(islice(it, size))
        if not batch:
            break
        yield batch