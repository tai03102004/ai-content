"""
Flask API service for RAG operations
Simplified version - only essential endpoints
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
from dotenv import load_dotenv
from rag_core import get_rag_core
import concurrent.futures

load_dotenv()

app = Flask(__name__)
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize RAG core
try:
    rag_core = get_rag_core()
except Exception as e:
    logger.error(f"❌ Failed to initialize RAG Core: {e}")
    rag_core = None

COLLECTION_NAME = "demo_enterprise_knowledge"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    if not rag_core:
        return jsonify({
            'status': 'error',
            'message': 'RAG Core not initialized'
        }), 503
    
    is_ready = rag_core.is_ready()
    return jsonify({
        'status': 'healthy' if is_ready else 'initializing',
        'vector_db_loaded': is_ready
    }), 200 if is_ready else 503

@app.route('/upload', methods=['POST'])
def upload_documents():
    """
    Upload and ingest documents from folder/file
    
    Request body:
    {
        "folder_path": "/path/to/folder/or/file.pdf",
        "collection_name": "demo_enterprise_knowledge" (optional)
    }
    """
    try:
        data = request.json
        folder_path = data.get('folder_path')
        collection_name = data.get('collection_name', COLLECTION_NAME)
        
        if not folder_path:
            return jsonify({'error': 'folder_path is required'}), 400
        
        if not os.path.exists(folder_path):
            return jsonify({'error': f'Path not found: {folder_path}'}), 404
        
        if not rag_core or not rag_core.is_ready():
            return jsonify({'error': 'Vector DB not ready'}), 503
        
        logger.info(f"📂 Starting ingestion from: {folder_path}")
        
        from rag import process_pdf_file
        
        # Scan files
        files_to_process = []
        if os.path.isdir(folder_path):
            for root, _, files in os.walk(folder_path):
                for file in files:
                    if not file.startswith('.') and file.lower().endswith(('.pdf', '.docx')):
                        full_path = os.path.join(root, file)
                        files_to_process.append(full_path)
        elif os.path.isfile(folder_path):
            if folder_path.lower().endswith(('.pdf', '.docx')):
                files_to_process.append(folder_path)
            else:
                return jsonify({'error': 'File must be PDF or DOCX'}), 400
        
        if not files_to_process:
            return jsonify({
                'success': False,
                'error': 'No PDF/DOCX files found'
            }), 400
        
        # Process files
        total_chunks = []
        processed_count = 0
        errors = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_to_file = {executor.submit(process_pdf_file, f): f for f in files_to_process}
            
            for future in concurrent.futures.as_completed(future_to_file):
                file_path = future_to_file[future]
                try:
                    chunks, _ = future.result()
                    if chunks:
                        total_chunks.extend(chunks)
                        processed_count += 1
                        logger.info(f"✅ Processed: {os.path.basename(file_path)} ({len(chunks)} chunks)")
                except Exception as e:
                    error_msg = f"Error processing {os.path.basename(file_path)}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    errors.append(error_msg)
        
        # Save to ChromaDB
        if total_chunks:
            db = rag_core.get_vector_db(collection_name)
            db.add_documents(total_chunks)
            
            return jsonify({
                'success': True,
                'message': f'Successfully ingested {processed_count} files',
                'total_chunks': len(total_chunks),
                'collection_name': collection_name,
                'processed_files': processed_count
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'No documents to ingest',
                'errors': errors
            }), 400
        
    except Exception as e:
        logger.error(f"❌ Upload error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/retrieve', methods=['POST'])
def retrieve_documents():
    """
    Retrieve relevant documents by keywords
    
    Request body:
    {
        "query": "temperature humidity",
        "num_results": 5,
        "collection_name": "demo_enterprise_knowledge" (optional)
    }
    """
    try:
        data = request.json
        query = data.get('query')
        collection_name = data.get('collection_name', COLLECTION_NAME)
        num_results = data.get('num_results', 5)
        
        if not query:
            return jsonify({'error': 'query is required'}), 400
        
        if not rag_core or not rag_core.is_ready():
            return jsonify({'error': 'Vector DB not ready'}), 503
        
        docs = rag_core.retrieve_documents(
            query=query,
            collection_name=collection_name,
            num_results=num_results,
            use_hyde=False,
            search_type="mmr"
        )
        
        return jsonify({
            'success': True,
            'query': query,
            'num_results': len(docs),
            'documents': docs
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Retrieval error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)