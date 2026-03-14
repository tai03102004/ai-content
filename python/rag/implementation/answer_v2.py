import os
from openai import OpenAI
from dotenv import load_dotenv
import litellm
from litellm import completion
from pydantic import BaseModel, Field
from concurrent.futures import ThreadPoolExecutor
from tenacity import retry, wait_exponential, stop_after_attempt


import re
import hashlib
import redis
import pybreaker
from fastembed import SparseTextEmbedding

# Qdrant
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue,
    SparseVector, Prefetch,             
)

from qdrant_client.http import models as rest_models 
import logging

logger = logging.getLogger("answer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

load_dotenv(override=True)

litellm._turn_on_debug()

# Embedding key
YESCALE_API_KEY    = os.getenv("RAG_EMBEDDING_API_KEY", "")
# LLM key (Qwen3 - dùng cho rewrite, rerank, answer)
RAG_LLM_API_KEY    = os.getenv("RAG_OPEN_AI", "")

RAG_MODEL          = os.getenv("RAG_MODEL")
REWRITE_MODEL = os.getenv("REWRITE_MODEL", "openai/gpt-4.1-nano")
EMBEDDING_MODEL    = os.getenv("EMBEDDING_MODEL")
QDRANT_URL         = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY     = os.getenv("QDRANT_API_KEY")
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "https://api.yescale.io/v1")
LLM_BASE_URL       = os.getenv("LLM_BASE_URL", "https://api.yescale.io/v1")


REDIS_URL     = os.getenv("REDIS_URL", "redis://localhost:6379")
CACHE_TTL     = int(os.getenv("CACHE_TTL", "3600"))
MAX_Q_LEN     = 1000
BLOCKLISTED   = {'admin', 'config', 'system', 'root', 'drop', 'delete'}
SUSPICIOUS    = [r'exec\(', r'eval\(', r'__import__', r'<script>', r'javascript:']

RETRIEVAL_K      = 20
FINAL_K          = 10
MAX_RERANK_INPUT = 20

wait = wait_exponential(multiplier=1, min=4, max=60)
stop = stop_after_attempt(5)

openai_client = OpenAI(base_url=EMBEDDING_BASE_URL, api_key=YESCALE_API_KEY)

qdrant = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY if QDRANT_API_KEY else None,
    check_compatibility=False,
)

SYSTEM_PROMPT = """
You are a knowledgeable, friendly assistant representing the company Insurellm.
You are chatting with a user about Insurellm.
Your answer will be evaluated for accuracy, relevance and completeness, so make sure it only answers the question and fully answers it.
If you don't know the answer, say so.
For context, here are specific extracts from the Knowledge Base that might be directly relevant to the user's question:
{context}

With this context, please answer the user's question. Be accurate, relevant and complete.
"""

# ── Pydantic models ───────────────────────────────────────────────────────────
class Result(BaseModel):
    page_content: str
    metadata: dict


class RankOrder(BaseModel):
    order: list[int] = Field(
        description="Chunk IDs ranked from most to least relevant"
    )

# --- Redis
def _get_redis():
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        r.ping()
        return r
    except Exception as e:
        logger.warning(f"⚠️ Redis unavailable: {e}")
        return None

redis_client = _get_redis()

def get_cached(key: str):
    if not redis_client: return None
    try: return redis_client.get(f"rag:{key}")
    except: return None

def set_cache(key: str, value: str):
    if not redis_client: return
    try: redis_client.setex(f"rag:{key}", CACHE_TTL, value)
    except: pass

# --- Circuit Breaker

api_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)
# --- Input Validation
def validate_question(q: str) -> tuple[bool, str]:
    if not q or len(q.strip()) < 2:
        return False, "Câu hỏi quá ngắn."
    if len(q) > MAX_Q_LEN:
        return False, f"Câu hỏi quá dài (tối đa {MAX_Q_LEN} ký tự)."
    for p in SUSPICIOUS:
        if re.search(p, q, re.IGNORECASE):
            return False, "Câu hỏi không hợp lệ."
    return True, ""

def safe_collection_name(tenant_id: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', tenant_id.lower())[:59]
    if any(b in clean for b in BLOCKLISTED):
        clean = f"user_{clean}"
    return f"tenant_{clean}" if len(clean) >= 3 else "tenant_default"

sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")

def make_cache_key(question: str, tenant_id: str) -> str:
    return hashlib.md5(f"{tenant_id}:{question.strip().lower()}".encode()).hexdigest()


# ── Qdrant helpers ────────────────────────────────────────────────────────────
_collection_cache: set[str] = set()

def collection_exists(tenant_id: str) -> bool:
    col = safe_collection_name(tenant_id)
    if col in _collection_cache:
        return True
    existing = {c.name for c in qdrant.get_collections().collections}
    if col in existing:
        _collection_cache.add(col)
        return True
    return False


@retry(wait=wait, stop=stop)
@api_breaker
def embed(text: str) -> list[float]:
    # Dùng YESCALE_API_KEY (embedding key)
    return openai_client.embeddings.create(
        model=EMBEDDING_MODEL, input=[text]
    ).data[0].embedding

def fetch_context_unranked(
    tenant_id: str,
    question: str,
    doc_type_filter: str | None = None,
) -> list[Result]:
    col           = safe_collection_name(tenant_id)
    dense_vec     = embed(question)
    sparse_result = list(sparse_model.query_embed(question))[0]
    sparse_vec    = SparseVector(
        indices=sparse_result.indices.tolist(),
        values=sparse_result.values.tolist(),
    )

    query_filter = None
    if doc_type_filter:
        query_filter = Filter(
            must=[FieldCondition(key="type", match=MatchValue(value=doc_type_filter))]
        )

    try:
        hits = qdrant.query_points(
            collection_name=col,
            prefetch=[
                Prefetch(query=dense_vec,  using="dense",  limit=RETRIEVAL_K),
                Prefetch(query=sparse_vec, using="sparse", limit=RETRIEVAL_K),
            ],
            query=rest_models.FusionQuery(fusion=rest_models.Fusion.RRF),
            limit=RETRIEVAL_K,
            query_filter=query_filter,
            with_payload=True,
        ).points
    except Exception as e:
        logger.warning(f"⚠️ Hybrid failed ({e}), fallback dense")
        hits = qdrant.query_points(
            collection_name=col,
            query=dense_vec,
            using="dense",      
            limit=RETRIEVAL_K,
            query_filter=query_filter,
            with_payload=True,
        ).points
    return [
        Result(
            page_content=h.payload.get("page_content", ""),
            metadata={
                "source": h.payload.get("source", ""),
                "type":   h.payload.get("type", ""),
                "score":  h.score,
            },
        )
        for h in hits
    ]


@retry(wait=wait, stop=stop)
@api_breaker  
def rerank(question, chunks):
    # Dùng RAG_LLM_API_KEY (Qwen3 key)
    system_prompt = """
You are a document re-ranker.
You are provided with a question and a list of relevant chunks of text from a query of a knowledge base.
The chunks are provided in the order they were retrieved; this should be approximately ordered by relevance, but you may be able to improve on that.
You must rank order the provided chunks by relevance to the question, with the most relevant chunk first.
Reply only with the list of ranked chunk ids, nothing else. Include all the chunk ids you are provided with, reranked.
"""
    user_prompt = f"The user has asked the following question:\n\n{question}\n\nOrder all the chunks of text by relevance to the question, from most relevant to least relevant. Include all the chunk ids you are provided with, reranked.\n\n"
    user_prompt += "Here are the chunks:\n\n"
    for index, chunk in enumerate(chunks):
        lines   = chunk.page_content.split("\n\n")
        preview = "\n".join(lines[:2]) if len(lines) >= 2 else chunk.page_content[:200]
        user_prompt += f"# CHUNK ID: {index + 1}:\n{preview}\n\n"
    user_prompt += "Reply only with the list of ranked chunk ids, nothing else."
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    response = completion(
        model=REWRITE_MODEL,
        max_tokens=50,     
        messages=messages,
        response_format=RankOrder,
        api_key=RAG_LLM_API_KEY, 
        api_base=LLM_BASE_URL,
    )
    reply = response.choices[0].message.content
    order = RankOrder.model_validate_json(reply).order
    seen, valid = set(), []
    for i in order:
        if 1 <= i <= len(chunks) and i not in seen:
            valid.append(i)
            seen.add(i)
    return [chunks[i - 1] for i in valid]


def make_rag_messages(question: str, history: list[dict], chunks: list[Result]) -> list[dict]:
    context = "\n\n".join(
        f"Extract from {chunk.metadata['source']}:\n{chunk.page_content}" for chunk in chunks
    )
    system_prompt = SYSTEM_PROMPT.format(context=context)
    return (
        [{"role": "system", "content": system_prompt}]
        + history
        + [{"role": "user", "content": question}]
    )


@retry(wait=wait, stop=stop)
@api_breaker
def rewrite_query(question: str, history: list[dict]) -> str:
    message = f"""
You are in a conversation with a user, answering questions about the company Insurellm.
You are about to look up information in a Knowledge Base to answer the user's question.

This is the history of your conversation so far with the user:
{history}

And this is the user's current question:
{question}

Respond only with a short, refined question that you will use to search the Knowledge Base.
It should be a VERY short specific question most likely to surface content. Focus on the question details.
IMPORTANT: Respond ONLY with the precise knowledgebase query, nothing else.
"""
    response = completion(
        model=RAG_MODEL,
        messages=[{"role": "system", "content": message}],
        api_key=RAG_LLM_API_KEY,  
        api_base=LLM_BASE_URL,
    )
    return response.choices[0].message.content


def merge_chunks(primary, secondary):
    seen   = {c.page_content for c in primary}
    merged = primary[:]
    for c in secondary:
        if c.page_content not in seen:
            merged.append(c)
            seen.add(c.page_content)
    return merged


def fetch_context(tenant_id: str, question: str, history: list[dict]) -> list[Result]:
    with ThreadPoolExecutor(max_workers=3) as executor:
        f_rewrite = executor.submit(rewrite_query, question, history)
        f_chunks1 = executor.submit(fetch_context_unranked, tenant_id, question)

        rewritten = f_rewrite.result()
        f_chunks2 = executor.submit(fetch_context_unranked, tenant_id, rewritten)

        chunks1 = f_chunks1.result()
        chunks2 = f_chunks2.result()

    merged   = merge_chunks(chunks1, chunks2)
    reranked = rerank(question, merged[:MAX_RERANK_INPUT])
    return reranked[:FINAL_K]


@retry(wait=wait, stop=stop) 
def answer_question(
    question: str,
    history: list[dict] = [],
    tenant_id: str = "default",
) -> tuple[str, list[Result]]:
    ok, err = validate_question(question)
    if not ok:
        return err, []

    if not collection_exists(tenant_id):
        return "⚠️ Chưa có dữ liệu...", []
    
    cache_key = make_cache_key(question, tenant_id)
    cached    = get_cached(cache_key)
    if cached:
        logger.info("🎯 Cache HIT")
        return cached, []
    
    chunks   = fetch_context(tenant_id, question, history)
    messages = make_rag_messages(question, history, chunks)
    response = completion(model=RAG_MODEL, messages=messages,
                        api_key=RAG_LLM_API_KEY, api_base=LLM_BASE_URL)
    answer   = response.choices[0].message.content
    set_cache(cache_key, answer)

    return answer, chunks