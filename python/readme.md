# 1
# Tạo và kích hoạt môi trường ảo
python3 -m venv venv
source venv/bin/activate

# Cài đặt thư viện cần thiết
pip install --upgrade pip
pip install -r requirements.txt

# Khởi chạy ChromaDB (Vector Database)
docker compose up -d

# Kiểm tra trạng thái DB (Đảm bảo Status là "Up")
docker compose ps

# 2
# --- Cấu hình API LLM & Embedding ---
RAG_EMBEDDING_API_KEY=
RAG_OPEN_AI=

CHROMA_SERVER_HOST=localhost
CHROMA_SERVER_PORT=8000
CHROMA_AUTH_TOKEN=


# 3.chạy code:
cd python
streamlit run rag.py  