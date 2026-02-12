import os
from langchain_core.prompts import ChatPromptTemplate
from dotenv import load_dotenv

load_dotenv()

# Qdrant
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

# API & Model Config
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "https://api.yescale.io/v1")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.yescale.io/v1")
EMBEDDING_MODEL = "text-embedding-3-small"
LLM_MODEL = "o4-mini-2025-04-16"

VECTOR_SIZE = 1536

# Security
BLOCKLISTED_NAMES = {'admin', 'config', 'system', 'root', 'drop', 'delete'}

# Prompts
QA_TEMPLATE = ChatPromptTemplate.from_template(
    """Answer strictly based on the context provided. 
    If the answer is not in the context, strictly state: "I don't have enough information based on the provided documents."
    
    Context:
    {context}
    
    Question: {question}
    
    Answer:"""
)