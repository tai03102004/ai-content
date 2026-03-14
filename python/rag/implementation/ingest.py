"""
ingest.py — Production RAG Ingestion
- Đọc tài liệu từ Google Drive folder (mỗi user 1 folder)
- Chunk bằng LLM (doc ngắn) hoặc rule-based (doc dài)
- Lưu vector vào Qdrant với tenant isolation
"""
import os
import io
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tqdm import tqdm
from litellm import completion
from multiprocessing import Pool
from tenacity import retry, wait_exponential, stop_after_attempt

# Google Drive
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.service_account import Credentials

# Qdrant
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    PayloadSchemaType
)

load_dotenv(override=True)


CHUNK_MODEL       = os.getenv("CHUNK_MODEL", "openai/gpt-4.1-nano")
EMBEDDING_MODEL   = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "https://api.yescale.io/v1")
VECTOR_DIM        = 3072          # text-embedding-3-large
LLM_CHUNK_MAX     = 5_000         # chars — dùng LLM chunk nếu nhỏ hơn
CHUNK_SIZE        = 500           # chars — rule-based fallback
CHUNK_OVERLAP     = 100
AVERAGE_CHUNK_SIZE = 100
WORKERS           = 4
BATCH_SIZE        = 100

QDRANT_URL        = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY    = os.getenv("QDRANT_API_KEY")
GDRIVE_CREDS_FILE = "../service_account.json"

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

wait = wait_exponential(multiplier=1, min=10, max=240)
stop   = stop_after_attempt(5)

openai_client = OpenAI(base_url=EMBEDDING_BASE_URL, api_key=os.getenv("RAG_EMBEDDING_API_KEY"))
qdrant        = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

class Result(BaseModel):
    page_content: str
    metadata: dict


class Chunk(BaseModel):
    headline: str = Field(
        description="A brief heading for this chunk, typically a few words, that is most likely to be surfaced in a query",
    )
    summary: str = Field(
        description="A few sentences summarizing the content of this chunk to answer common questions"
    )
    original_text: str = Field(
        description="The original text of this chunk from the provided document, exactly as is, not changed in any way"
    )

    def as_result(self, document):
        metadata = {"source": document["source"], "type": document["type"]}
        return Result(
            page_content=self.headline + "\n\n" + self.summary + "\n\n" + self.original_text,
            metadata=metadata,
        )


class Chunks(BaseModel):
    chunks: list[Chunk]


# ── Google Drive ──────────────────────────────────────────────────────────────
def get_drive_service():
    creds = Credentials.from_service_account_file(GDRIVE_CREDS_FILE, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def list_files_in_folder(service, folder_id: str) -> list[dict]:
    """Trả về list file .md / .txt / .pdf trong folder."""
    supported_mime = {
        "text/plain",
        "text/markdown",
        "application/pdf",
        "application/vnd.google-apps.document",  # Google Docs → export as txt
    }
    query = f"'{folder_id}' in parents and trashed = false"
    result = service.files().list(
        q=query,
        fields="files(id, name, mimeType)",
        pageSize=1000,
    ).execute()

    files = [f for f in result.get("files", []) if f["mimeType"] in supported_mime]
    print(f"  Found {len(files)} files in folder {folder_id}")
    return files


def download_file(service, file_info: dict) -> str:
    """Download file content, trả về text string."""
    file_id   = file_info["id"]
    mime_type = file_info["mimeType"]

    if mime_type == "application/vnd.google-apps.document":
        # Export Google Doc → plain text
        request = service.files().export_media(fileId=file_id, mimeType="text/plain")
    else:
        request = service.files().get_media(fileId=file_id)

    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    return buf.getvalue().decode("utf-8", errors="replace")


def fetch_documents_from_drive(folder_id: str) -> list[dict]:
    """Tải toàn bộ docs từ Google Drive folder của 1 user."""
    service = get_drive_service()
    files   = list_files_in_folder(service, folder_id)
    docs    = []
    for f in files:
        try:
            text = download_file(service, f)
            if text.strip():
                docs.append({
                    "source": f["name"],
                    "type":   f["mimeType"],
                    "text":   text,
                })
        except Exception as e:
            print(f"  ⚠️  Bỏ qua {f['name']}: {e}")
    return docs

def make_chunk_prompt(document):
    how_many = (len(document["text"]) // AVERAGE_CHUNK_SIZE) + 1
    return f"""
You take a document and you split the document into overlapping chunks for a KnowledgeBase.

The document is from the shared drive of a company called Insurellm.
The document is of type: {document["type"]}
The document has been retrieved from: {document["source"]}

A chatbot will use these chunks to answer questions about the company.
You should divide up the document as you see fit, being sure that the entire document is returned across the chunks - don't leave anything out.
This document should probably be split into at least {how_many} chunks, but you can have more or less as appropriate, ensuring that there are individual chunks to answer specific questions.
There should be overlap between the chunks as appropriate; typically about 25% overlap or about 50 words, so you have the same text in multiple chunks for best retrieval results.

For each chunk, you should provide a headline, a summary, and the original text of the chunk.
Together your chunks should represent the entire document with overlap.

Here is the document:

{document["text"]}

Respond with the chunks.
"""


def rule_based_chunk(document: dict) -> list[Result]:
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
    return [c.as_result(document["source"], document["type"]) for c in chunks]

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

# ── Embeddings + Qdrant ───────────────────────────────────────────────────────
def collection_name(tenant_id: str) -> str:
    return f"tenant_{tenant_id}"

def ensure_collection(col: str):
    existing = {c.name for c in qdrant.get_collections().collections}
    if col not in existing:
        qdrant.create_collection(
            collection_name=col,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        # Index payload fields để filter nhanh
        qdrant.create_payload_index(col, "source", PayloadSchemaType.KEYWORD)
        qdrant.create_payload_index(col, "type",   PayloadSchemaType.KEYWORD)
        print(f"  Created Qdrant collection: {col}")


@retry(wait=wait, stop=stop)
def embed_batch(texts: list[str]) -> list[list[float]]:
    resp = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [e.embedding for e in resp.data]


def upsert_chunks(tenant_id: str, chunks: list[Result], replace: bool = True):
    col = collection_name(tenant_id)

    if replace:
        existing = {c.name for c in qdrant.get_collections().collections}
        if col in existing:
            qdrant.delete_collection(col)
            print(f"  Dropped existing collection: {col}")

    ensure_collection(col)

    for i in tqdm(range(0, len(chunks), BATCH_SIZE), desc=f"Upserting [{tenant_id}]"):
        batch   = chunks[i : i + BATCH_SIZE]
        texts   = [c.page_content for c in batch]
        vectors = embed_batch(texts)
        points  = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={"page_content": text, **chunk.metadata},
            )
            for text, vec, chunk in zip(texts, vectors, batch)
        ]
        qdrant.upsert(collection_name=col, points=points)

    print(f"  ✅ {col}: {qdrant.count(col).count} vectors stored")


# ── Public API ────────────────────────────────────────────────────────────────
def ingest_user(tenant_id: str, gdrive_folder_id: str, replace: bool = True):
    """
    Ingest toàn bộ Google Drive folder của 1 user vào Qdrant.

    Args:
        tenant_id:        ID định danh user (vd: user email hash, UUID)
        gdrive_folder_id: Google Drive folder ID của user
        replace:          Xoá và tạo lại collection nếu True
    """
    print(f"\n{'='*50}")
    print(f"Ingesting tenant: {tenant_id}")
    print(f"Drive folder:     {gdrive_folder_id}")

    docs   = fetch_documents_from_drive(gdrive_folder_id)
    if not docs:
        print("  ⚠️  No documents found. Skipping.")
        return

    chunks = create_chunks(docs)
    print(f"  Total chunks: {len(chunks)}")

    upsert_chunks(tenant_id, chunks, replace=replace)
    print(f"  ✅ Done: tenant={tenant_id}\n")


if __name__ == "__main__":
    # Ví dụ ingest cho 1 user
    ingest_user(
        tenant_id="user_abc123",
        gdrive_folder_id="13pSJGlXVTyb3GEmLu7FDPkupCmJXByJJ",
    )