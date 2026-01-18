import chromadb

# Kết nối tới ChromaDB server
client = chromadb.HttpClient(host="localhost", port=8000)

# List collections
collections = client.list_collections()
print(f"📦 Collections: {len(collections)}")

for coll in collections:
    print(f"\n✅ Collection: {coll.name}")
    count = coll.count()
    print(f"   Total chunks: {count}")
    
    # Get all documents
    results = coll.get(limit=100)
    
    print(f"   📄 Sample chunks:")
    for i, doc_id in enumerate(results['ids'][:5]):
        content = results['documents'][i]
        metadata = results['metadatas'][i]
        
        print(f"\n   [{i+1}] ID: {doc_id}")
        print(f"       Source: {metadata.get('source', 'N/A')}")
        print(f"       Content: {content[:150]}...")