"""
main.py — FastAPI Production Server
Deploy lên Railway
"""

import os
import hashlib
import asyncio
from functools import partial
from contextlib import asynccontextmanager

import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from implementation.answer_v2 import answer_question, collection_exists
from implementation.ingest_v2 import ingest_user

load_dotenv(override=True)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 RAG API starting...")
    yield
    print("🛑 RAG API stopped")


app = FastAPI(title="RAG API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────
def get_tenant_id(x_user_id: str = Header(...)) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    # Hash để không lộ thông tin user trong tên collection
    return hashlib.sha256(x_user_id.encode()).hexdigest()[:16]


# ── Schemas ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    history:  list[dict] = Field(default=[])

class ChatResponse(BaseModel):
    answer:      str
    sources:     list[str]
    chunks_used: int
    cached:      bool = False


class IngestRequest(BaseModel):
    folder_path: str = Field(..., description="Đường dẫn folder chứa tài liệu")
    replace:     bool = Field(default=True)


# ── Ingest status tracking ────────────────────────────────────────────────────
ingest_jobs: dict[str, str] = {}  # tenant_id → "running|done|error:..."


def _run_ingest(tenant_id: str, folder_path: str, replace: bool):
    try:
        ingest_jobs[tenant_id] = "running"
        ingest_user(tenant_id, folder_path, replace=replace)
        ingest_jobs[tenant_id] = "done"
    except Exception as e:
        ingest_jobs[tenant_id] = f"error: {e}"


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <html><body>
    <h2>🤖 RAG API</h2>
    <p><a href="/docs">📖 API Docs (Swagger)</a></p>
    <p><a href="/health">❤️ Health Check</a></p>
    </body></html>
    """


@app.get("/health")
async def health():
    return {"status": "ok", "version": app.version}

@app.post("/upload", summary="Upload tài liệu từ máy tính")
async def upload_files(
    x_user_id: str = Header(..., description="User ID, vd: user_test_001"),
    files: list[UploadFile] = File(...),
):
    tenant_id  = get_tenant_id(x_user_id)
    upload_dir = Path(f"uploads/{tenant_id}")
    upload_dir.mkdir(parents=True, exist_ok=True)

    allowed = {".txt", ".md", ".docx"}
    saved   = []

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in allowed:
            continue
        dest = upload_dir / file.filename
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(file.filename)

    if not saved:
        raise HTTPException(400, "Không có file hợp lệ (.txt .md .docx)")

    ingest_jobs[tenant_id] = "running"
    asyncio.get_event_loop().run_in_executor(
        None,
        partial(_run_ingest, tenant_id, str(upload_dir), True)
    )

    return {
        "uploaded": saved,
        "status":   "ingesting",
        "message":  "Upload xong, đang ingest. Dùng GET /ingest/status để kiểm tra."
    }

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, x_user_id: str = Header(...)):
    tenant_id = get_tenant_id(x_user_id)

    loop = asyncio.get_event_loop()
    try:
        answer, chunks = await loop.run_in_executor(
            None,
            partial(answer_question, req.question, req.history, tenant_id),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    sources = list(dict.fromkeys(
        c.metadata.get("source", "") for c in chunks
        if c.metadata.get("source")
    ))

    return ChatResponse(
        answer=answer,
        sources=sources,
        chunks_used=len(chunks),
        cached=len(chunks) == 0 and answer != "⚠️ Chưa có dữ liệu...",
    )


@app.post("/ingest")
async def ingest(
    req: IngestRequest,
    background: BackgroundTasks,
    x_user_id: str = Header(...),
):
    tenant_id = get_tenant_id(x_user_id)

    if ingest_jobs.get(tenant_id) == "running":
        raise HTTPException(status_code=409, detail="Ingest đang chạy")

    background.add_task(_run_ingest, tenant_id, req.folder_path, req.replace)
    return {"status": "accepted", "message": "Ingest đã bắt đầu. Poll /ingest/status để kiểm tra."}


@app.get("/ingest/status")
async def ingest_status(x_user_id: str = Header(...)):
    tenant_id = get_tenant_id(x_user_id)
    return {
        "status":   ingest_jobs.get(tenant_id, "not_started"),
        "has_data": collection_exists(tenant_id),
    }


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 10000)),
        reload=False,
    )