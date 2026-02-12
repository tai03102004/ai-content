FROM python:3.9-slim

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy file requirements trước để tận dụng Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- TỐI ƯU HÓA: Tải trước model BM25 ---
# Bước này giúp container khởi động nhanh và không cần internet lúc runtime
RUN python -c "from fastembed import SparseTextEmbedding; \
    SparseTextEmbedding(model_name='Qdrant/bm25')"

# Copy toàn bộ code vào
COPY . .

# Mở port (Tùy bạn chạy Flask hay Streamlit)
EXPOSE 5000 8501

# Command mặc định (Ví dụ chạy Flask)
CMD ["python", "app.py"]