import streamlit as st
import logging
import os
import warnings
from dotenv import load_dotenv
import concurrent.futures
import pdfplumber

load_dotenv()

from rag_core import get_rag_core

# Suppress torch warning
warnings.filterwarnings('ignore', category=UserWarning, message='.*torch.classes.*')

from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
from docx import Document as DocxDocument


# Set protobuf environment variable
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

def process_question(question: str, collection_name: str) -> str:
    rag_core = get_rag_core()
    result = rag_core.answer_question(
        question=question,
        collection_name=collection_name, 
        context_size=5
    )
    if result['success']:
        return result['answer']
    else:
        return f"Error: {result.get('error', 'Unknown error')}"

def process_pdf_file(file_path: str):    
    try:
        file_ext = os.path.splitext(file_path)[1].lower()
        chunks = []
        pdf_pages = []

        if file_ext == '.docx':
            docx = DocxDocument(file_path)
            full_text = "\n".join([p.text for p in docx.paragraphs])
            if not full_text.strip(): return [], []
            
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
            doc = Document(
                page_content=full_text,
                metadata={"source": os.path.basename(file_path), "file_path": file_path}
            )
            chunks = text_splitter.split_documents([doc])
            
        else:
            # 1. Configure Docling
            pipeline_options = PdfPipelineOptions(do_table_structure=True)
            pipeline_options.table_structure_options.do_cell_matching = True
            pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE

            converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(
                        pipeline_options=pipeline_options,
                        backend=PyPdfiumDocumentBackend
                    )
                }
            )
            
            # 2. Convert PDF
            result = converter.convert(file_path)
            full_markdown = result.document.export_to_markdown()

            if not full_markdown.strip(): return [], []

            try:
                with pdfplumber.open(file_path) as pdf:
                    # Chỉ lấy trang đầu để tiết kiệm RAM
                    if len(pdf.pages) > 0:
                        pdf_pages = [pdf.pages[0].to_image().original]
            except Exception:
                pass

            # 3. Splitting
            headers_to_split_on = [("#", "Header 1"), ("##", "Header 2"), ("###", "Header 3")]
            markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
            md_header_splits = markdown_splitter.split_text(full_markdown)
            
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
            chunks = text_splitter.split_documents(md_header_splits)
            

        # Update Metadata
        for chunk in chunks:
            chunk.metadata.update({
                "source": os.path.basename(file_path),
                "file_path": file_path
            })
        
        return chunks, pdf_pages
        
    except Exception as e:
        logger.error(f"Error processing file {file_path}: {e}")
        raise e

def ingest_folder(folder_path: str, collection_name: str):
    rag_core = get_rag_core()
    
    # 1. Quét file
    files_to_process = []
    if os.path.isdir(folder_path):
        for root, _, files in os.walk(folder_path):
            logger.info(f"📂 Subfolder: {root}, Files: {files}")
            for file in files:
                if not file.startswith('.') and file.lower().endswith(('.pdf', '.docx')):
                    full_path = os.path.join(root, file)
                    files_to_process.append(full_path)
                    logger.info(f"✅ Found: {full_path}")
    
    if not files_to_process:
        st.warning("⚠️ Không tìm thấy file PDF/DOCX nào!")
        logger.warning(f"❌ No PDF/DOCX files found in {folder_path}")
        return

    # 2. Xử lý song song
    total_chunks = []
    all_pages = []
    processed_count = 0
    
    status_bar = st.progress(0, text="🚀 Đang khởi động Worker...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_to_file = {executor.submit(process_pdf_file, f): f for f in files_to_process}
        
        for i, future in enumerate(concurrent.futures.as_completed(future_to_file)):
            file_path = future_to_file[future]
            try:
                chunks, pages = future.result()
                if chunks:
                    total_chunks.extend(chunks)
                    if len(all_pages) < 10: 
                        all_pages.extend(pages)
                    
                    # FIX: Cập nhật danh sách file đã xử lý vào Session
                    file_name = os.path.basename(file_path)
                    if file_name not in st.session_state["processed_files"]:
                        st.session_state["processed_files"].append(file_name)
                    
                    processed_count += 1
            except Exception as e:
                logger.error(f"Lỗi file {file_path}: {e}")
            
            # Update UI
            progress = (i + 1) / len(files_to_process)
            status_bar.progress(progress, text=f"Đang xử lý {i+1}/{len(files_to_process)}")

    # 3. Lưu vào DB
    if total_chunks:
        with st.spinner("💾 Đang lưu vào ChromaDB Server..."):
            db = rag_core.get_vector_db(collection_name)
            db.add_documents(total_chunks)
            
            if "pdf_pages" not in st.session_state: st.session_state["pdf_pages"] = []
            st.session_state["pdf_pages"].extend(all_pages)
            
            st.success(f"✅ Hoàn tất! Đã xử lý {processed_count} files.")
    
    status_bar.empty()

def main() -> None:
    st.set_page_config(page_title="Enterprise RAG", page_icon="🏢", layout="wide")
    
    st.subheader("🏢 Enterprise RAG Playground", divider="gray")
    col1, col2 = st.columns([1.5, 2])

    COLLECTION_NAME = "demo_enterprise_knowledge"

    # Init Session
    if "messages" not in st.session_state: st.session_state["messages"] = []
    if "processed_files" not in st.session_state: st.session_state["processed_files"] = []
    if "pdf_pages" not in st.session_state: st.session_state["pdf_pages"] = []
    if "has_db" not in st.session_state: st.session_state["has_db"] = False

    with col1:
        st.markdown("### 📁 Batch Upload (Folder)")
        folder_path = st.text_input(
            "Nhập đường dẫn thư mục",
            placeholder="/Users/name/Documents/Contracts",
            key="folder_input"
        )
        
        if st.button("🚀 Xử lý Thư mục", type="primary"):
            if folder_path and os.path.exists(folder_path):
                ingest_folder(folder_path, COLLECTION_NAME)
                st.session_state["has_db"] = True
            else:
                st.error("❌ Thư mục không tồn tại!")

        # List Files
        if st.session_state["processed_files"]:
            with st.expander(f"📚 Files đã nạp ({len(st.session_state['processed_files'])})"):
                for f in st.session_state["processed_files"]:
                    st.text(f"• {f}")

        # Preview Images
        if st.session_state["pdf_pages"]:
            st.markdown("---")
            st.caption("📄 Document Preview (First Pages)")
            zoom = st.slider("Zoom", 100, 800, 300)
            with st.container(height=300, border=True):
                for img in st.session_state["pdf_pages"]:
                    st.image(img, width=zoom)

        # Clear DB Button
        if st.button("🗑️ Xóa Dữ liệu Demo"):
            rag_core = get_rag_core()
            try:
                db = rag_core.get_vector_db(COLLECTION_NAME)
                db.delete_collection()
                # Reset State
                st.session_state["processed_files"] = []
                st.session_state["pdf_pages"] = []
                st.session_state["messages"] = []
                st.session_state["has_db"] = False
                st.success("Đã xóa sạch dữ liệu!")
                st.rerun()
            except Exception as e:
                st.error(f"Lỗi xóa DB: {e}")

    # Chat interface
    with col2:
        msg_container = st.container(height=600, border=True)

        for msg in st.session_state["messages"]:
            avatar = "🤖" if msg["role"] == "assistant" else "👤"
            with msg_container.chat_message(msg["role"], avatar=avatar):
                st.markdown(msg["content"])

        if prompt := st.chat_input("Hỏi gì đó về tài liệu..."):
            st.session_state["messages"].append({"role": "user", "content": prompt})
            with msg_container.chat_message("user", avatar="👤"):
                st.markdown(prompt)

            if not st.session_state["has_db"]:
                st.warning("⚠️ Vui lòng nạp tài liệu trước khi hỏi!")
            else:
                with msg_container.chat_message("assistant", avatar="🤖"):
                    with st.spinner("Đang suy nghĩ..."):
                        response = process_question(prompt, COLLECTION_NAME)
                        st.markdown(response)
                
                st.session_state["messages"].append({"role": "assistant", "content": response})

if __name__ == "__main__":
    main()