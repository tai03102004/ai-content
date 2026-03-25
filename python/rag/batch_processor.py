import json
import argparse
from implementation.answer_v2 import batch_answer_questions

def main():
    parser = argparse.ArgumentParser(description='Batch process questions using RAG')
    parser.add_argument('--input', '-i', type=str, required=True, 
                       help='Input file with questions (one per line)')
    parser.add_argument('--output', '-o', type=str, required=True, 
                       help='Output file for results (JSON format)')
    parser.add_argument('--tenant-id', '-t', type=str, default='default',
                       help='Tenant ID for the operation')
    parser.add_argument('--workers', '-w', type=int, default=5,
                       help='Number of concurrent workers')
    
    args = parser.parse_args()
    
    # Read questions from input file
    with open(args.input, 'r', encoding='utf-8') as f:
        questions = [line.strip() for line in f.readlines() if line.strip()]
    
    print(f"Processing {len(questions)} questions...")
    
    # Process questions in batch
    results = batch_answer_questions(
        questions=questions,
        tenant_id=args.tenant_id,
        max_workers=args.workers,
        timeout=120
    )
    
    # Format results
    formatted_results = [
        {
            "question": q,
            "answer": r[0],
            "context_count": len(r[1]),
            "contexts": [
                {
                    "source": ctx.metadata.get("source", ""),
                    "type": ctx.metadata.get("type", ""),
                    "content": ctx.page_content
                } 
                for ctx in r[1]
            ]
        }
        for q, r in zip(questions, results)
    ]
    
    # Write results to output file
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(formatted_results, f, ensure_ascii=False, indent=2)
    
    print(f"Results saved to {args.output}")

if __name__ == "__main__":
    main()