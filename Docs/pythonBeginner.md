## Memory — what you ran

Runs entirely on your machine
Uses Qdrant in-memory as the local vector store (that's what the Qdrant cleanup errors were on Ctrl+C — it was shutting down the local DB)
Uses your OpenAI key to extract facts (runs a small LLM call internally on .add())
Data lives in RAM — dies when process exits by default
No Mem0 account needed, no API key for Mem0
Syntax: mem0.search(query, user_id="1237", limit=5)

This is why it worked — Memory is the open-source self-hosted version.
<!-- ----------------------------------------- -->
from mem0 import Memory          # ← local/self-hosted
mem0 = Memory()
mem0.add(conversation, user_id="1237")
mem0.search(query, user_id="1237")
<!-- ----------------------------------------- -->

## MemoryClient — what the docs show

Hits Mem0's cloud API over HTTP
Your memories stored on Mem0's servers — truly persistent, survives process exits
Needs a Mem0 account + api_key
version="v2" and the filters dict are their newer cloud API features
Syntax is slightly richer — filter by user_id, agent_id, app_id etc.

<!-- ----------------------------------------- -->
from mem0 import MemoryClient    # ← cloud-hosted (their platform)
client = MemoryClient(api_key="your-api-key")
client.add(messages, user_id="alex")
client.search(query, version="v2", filters={...})
<!-- ----------------------------------------- -->