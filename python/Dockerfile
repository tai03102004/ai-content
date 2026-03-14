FROM python:3.12-slim
 
WORKDIR /app
 
# Cài dependencies trước (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
 
# Copy code
COPY . .
 
EXPOSE 8000
 
CMD ["python", "main.py"]
 