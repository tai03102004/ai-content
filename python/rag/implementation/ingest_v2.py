"""
ingest.py — Production RAG Ingestion
- Đọc tài liệu từ local folder (txt, md, pdf, docx)
- Chunk bằng LLM (doc ngắn) hoặc rule-based (doc dài)
- Lưu vector vào Qdrant với tenant isolation
"""

import os
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from docx import Document
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tqdm import tqdm
from litellm import completion
from tenacity import retry, wait_exponential, stop_after_attempt
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, PayloadSchemaType,
    SparseVectorParams, SparseIndexParams,SparseVector
)
from fastembed import SparseTextEmbedding

load_dotenv(override=True)

# ── Config ────────────────────────────────────────────────────────────────────
CHUNK_MODEL        = os.getenv("CHUNK_MODEL", "openai/gpt-4.1-nano")
EMBEDDING_MODEL    = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "https://api.yescale.io/v1")
YESCALE_API_KEY    = os.getenv("RAG_EMBEDDING_API_KEY")

VECTOR_DIM         = 3072   # text-embedding-3-large
LLM_CHUNK_MAX      = 5_000  # dùng LLM chunk nếu doc nhỏ hơn 5000 ký tự
CHUNK_SIZE         = 500    # rule-based fallback
CHUNK_OVERLAP      = 100
AVERAGE_CHUNK_SIZE = 100
WORKERS            = 4
BATCH_SIZE         = 100

QDRANT_URL         = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY     = os.getenv("QDRANT_API_KEY")
# ── Clients ───────────────────────────────────────────────────────────────────
# OpenAI client → dùng cho embedding (trỏ vào YeScale)
openai_client = OpenAI(base_url=EMBEDDING_BASE_URL, api_key=YESCALE_API_KEY)

# litellm → dùng cho chunking LLM (trỏ vào YeScale)
os.environ["OPENAI_API_KEY"]  = YESCALE_API_KEY or ""
os.environ["OPENAI_BASE_URL"] = EMBEDDING_BASE_URL

# Qdrant client
qdrant = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY if QDRANT_API_KEY else None,
    check_compatibility=False,
)

sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")


wait = wait_exponential(multiplier=1, min=10, max=60)
stop = stop_after_attempt(5)


# ── Pydantic models ───────────────────────────────────────────────────────────
class Result(BaseModel):
    page_content: str
    metadata: dict


class Chunk(BaseModel):
    headline: str = Field(description="Tiêu đề ngắn cho chunk, dễ tìm kiếm")
    summary: str  = Field(description="Tóm tắt 2-3 câu nội dung chunk")
    original_text: str = Field(description="Nguyên văn đoạn text, không thay đổi")

    def as_result(self, document: dict) -> Result:
        return Result(
            page_content=f"{self.headline}\n\n{self.summary}\n\n{self.original_text}",
            metadata={"source": document["source"], "type": document["type"]},
        )


class Chunks(BaseModel):
    chunks: list[Chunk]


# ── Load documents từ local folder ───────────────────────────────────────────
def fetch_documents_from_folder(folder_path: str) -> list[dict]:
    folder = Path(folder_path)
    if not folder.exists():
        print(f"  ❌ Thư mục không tồn tại: {folder_path}")
        return []

    supported_ext = {".txt", ".md", ".docx"}
    docs = []

    for file in folder.rglob("*"):
        if file.suffix.lower() not in supported_ext:
            continue
        try:
            if file.suffix.lower() == ".docx":
                doc  = Document(file)
                text = "\n".join(p.text for p in doc.paragraphs)
            else:
                text = file.read_text(encoding="utf-8", errors="replace")

            if text.strip():
                docs.append({
                    "source": file.name,
                    "type":   file.suffix.lstrip("."),
                    "text":   text,
                })
                print(f"  ✅ Loaded: {file.name}")

        except Exception as e:
            print(f"  ⚠️  Bỏ qua {file.name}: {e}")

    print(f"  Found {len(docs)} files in '{folder_path}'")
    return docs


# ── Chunking ──────────────────────────────────────────────────────────────────
def make_chunk_prompt(document: dict) -> str:
    how_many = max(1, len(document["text"]) // AVERAGE_CHUNK_SIZE)
    return f"""Split this document into overlapping chunks for a RAG knowledge base.

Document type: {document["type"]}
Document source: {document["source"]}

Rules:
- Create at least {how_many} chunks
- ~25% overlap between chunks (~50 words)
- Each chunk: headline (short title), summary (2-3 sentences), original_text (verbatim)
- Cover the ENTIRE document, do not skip anything

Document:
{document["text"]}
"""


def rule_based_chunk(document: dict) -> list[Result]:
    """Fallback khi doc quá dài để gọi LLM."""
    text   = document["text"]
    chunks = []
    start  = 0
    while start < len(text):
        end        = start + CHUNK_SIZE
        chunk_text = text[start:end]
        if end < len(text):
            bp = max(chunk_text.rfind("."), chunk_text.rfind("\n"))
            if bp > CHUNK_SIZE * 0.5:
                chunk_text = chunk_text[:bp + 1]
                end        = start + bp + 1
        if chunk_text.strip():
            chunks.append(Result(
                page_content=chunk_text.strip(),
                metadata={"source": document["source"], "type": document["type"]},
            ))
        start = end - CHUNK_OVERLAP
    return chunks


@retry(wait=wait, stop=stop)
def llm_chunk_document(document: dict) -> list[Result]:
    if len(document["text"]) > LLM_CHUNK_MAX:
        return rule_based_chunk(document)

    response = completion(
        model=CHUNK_MODEL,
        messages=[{"role": "user", "content": make_chunk_prompt(document)}],
        response_format=Chunks,
    )
    raw    = response.choices[0].message.content
    chunks = Chunks.model_validate_json(raw).chunks
    return [c.as_result(document) for c in chunks]


def create_chunks(documents: list[dict]) -> list[Result]:
    all_chunks = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(llm_chunk_document, doc): doc for doc in documents}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="Chunking"):
            try:
                all_chunks.extend(fut.result())
            except Exception as e:
                print(f"  ⚠️  Chunk error: {e}")
    return all_chunks


# ── Qdrant helpers ────────────────────────────────────────────────────────────
def collection_name(tenant_id: str) -> str:
    return f"tenant_{tenant_id}"


def ensure_collection(col: str):
    existing = {c.name for c in qdrant.get_collections().collections}
    if col not in existing:
        qdrant.create_collection(
            collection_name=col,
            # Dense vectors =
            vectors_config={"dense": VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)},
            # Sparse vectors 
            sparse_vectors_config={"sparse": SparseVectorParams(
                index=SparseIndexParams(on_disk=False)
            )},
        )
        qdrant.create_payload_index(col, "source", PayloadSchemaType.KEYWORD)
        qdrant.create_payload_index(col, "type",   PayloadSchemaType.KEYWORD)
        print(f"  Created collection (dense+sparse): {col}")


@retry(wait=wait, stop=stop)
def embed_batch(texts: list[str]) -> list[list[float]]:
    resp = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [e.embedding for e in resp.data]

def sparse_batch(texts: list[str]) -> list[dict]:
    """Tính BM25 sparse vectors cho 1 batch text."""
    results = list(sparse_model.embed(texts))
    return [
        {"indices": r.indices.tolist(), "values": r.values.tolist()}
        for r in results
    ]

def upsert_chunks(tenant_id: str, chunks: list[Result], replace: bool = True):
    col = collection_name(tenant_id)

    if replace:
        existing = {c.name for c in qdrant.get_collections().collections}
        if col in existing:
            qdrant.delete_collection(col)
            print(f"  Dropped old collection: {col}")

    ensure_collection(col)

    for i in tqdm(range(0, len(chunks), BATCH_SIZE), desc=f"Upserting [{tenant_id}]"):
        batch   = chunks[i : i + BATCH_SIZE]
        texts   = [c.page_content for c in batch]
        dense_vecs   = embed_batch(texts)      
        sparse_vecs  = sparse_batch(texts)
        points  = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "dense":  d_vec,           
                    "sparse": SparseVector(     
                        indices=s_vec["indices"],
                        values=s_vec["values"],
                    ),
                },
                payload={"page_content": text, **chunk.metadata},
            )
            for text, d_vec, s_vec, chunk in zip(texts, dense_vecs, sparse_vecs, batch)
        ]
        qdrant.upsert(collection_name=col, points=points)

    print(f"  ✅ {col}: {qdrant.count(col).count} vectors stored")


# ── Public entry point ────────────────────────────────────────────────────────
def ingest_user(tenant_id: str, folder_path: str, replace: bool = True):
    """
    Ingest toàn bộ tài liệu trong folder vào Qdrant cho 1 user.

    Args:
        tenant_id:   ID của user (vd: "user_abc123")
        folder_path: Đường dẫn thư mục chứa tài liệu
        replace:     Xoá và tạo lại collection nếu True
    """
    print(f"\n{'='*50}")
    print(f"Tenant  : {tenant_id}")
    print(f"Folder  : {folder_path}")

    docs = fetch_documents_from_folder(folder_path)
    if not docs:
        print("  ⚠️  Không có tài liệu nào. Dừng.")
        return

    chunks = create_chunks(docs)
    print(f"  Total chunks: {len(chunks)}")

    upsert_chunks(tenant_id, chunks, replace=replace)
    print(f"  ✅ Done: tenant={tenant_id}\n")


if __name__ == "__main__":
    ingest_user(
        tenant_id="user_test_001",
        folder_path="./test_data",
    )