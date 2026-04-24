---
id: rag-chunk-retriever
name: RAG Chunk Retriever
version: 1.0.0
description: >
  Retrieves the top-k most semantically relevant document chunks for a natural
  language query from a pre-built vector index (Chroma, Pinecone, or Weaviate).
  Accepts a query string and index connection config, returns ranked chunks with
  source file, similarity score, and chunk text for use in RAG pipelines.
capability:
  type: retrieval
  inputs:
    - "query:string"
    - "index_config:dict"
    - "top_k:int"
    - "score_threshold:float"
  outputs:
    - "chunks:list"
    - "sources:list"
    - "latency_ms:int"
graph:
  depends_on: []
  complements: ["embedding-batch-generator", "context-window-packer"]
  co_used_with: ["prompt-template-renderer", "llm-eval-runner"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: false
  mcp: true
risk: network
---

## What this skill does

Queries a pre-built vector database index to retrieve the top-k document chunks
most relevant to the input query. Handles embedding the query using the same
model used during indexing, performing ANN search, and filtering results by
similarity score threshold. Returns results sorted by relevance with full
source attribution for citation in the final LLM response.

## Inputs

- `query` — natural language question or search string
- `index_config` — connection config: `{provider, collection_name, api_key, environment}`
- `top_k` — number of chunks to return (default: 5)
- `score_threshold` — minimum similarity score to include a chunk (default: 0.7, range: 0–1)

## Outputs

- `chunks` — list of `{text, source_file, page, score, chunk_id}` objects sorted by score descending
- `sources` — deduplicated list of source file paths that contributed chunks
- `latency_ms` — query latency in milliseconds (embedding + ANN search combined)

## Supported vector databases

- **Chroma** — `provider: "chroma"`, runs locally or via ChromaDB server
- **Pinecone** — `provider: "pinecone"`, requires API key and environment
- **Weaviate** — `provider: "weaviate"`, requires cluster URL and API key

## Example

```python
config = {
    "provider": "chroma",
    "collection_name": "product_docs",
    "embedding_model": "text-embedding-3-small"
}
result = rag_chunk_retriever(
    query="How do I reset my password?",
    index_config=config,
    top_k=3,
    score_threshold=0.75
)
```

```json
{
  "chunks": [
    {"text": "To reset your password, click Forgot Password on the login page...", "source_file": "docs/account.md", "score": 0.92},
    {"text": "Password reset emails expire after 24 hours...", "source_file": "docs/security.md", "score": 0.81}
  ],
  "sources": ["docs/account.md", "docs/security.md"],
  "latency_ms": 43
}
```
