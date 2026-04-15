
```
██╗      █████╗ ███╗   ██╗ ██████╗  ██████╗ ██████╗  █████╗ ██████╗ ██╗  ██╗
██║     ██╔══██╗████╗  ██║██╔════╝ ██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██║  ██║
██║     ███████║██╔██╗ ██║██║  ███╗██║  ███╗██████╔╝███████║██████╔╝███████║
██║     ██╔══██║██║╚██╗██║██║   ██║██║   ██║██╔══██╗██╔══██║██╔═══╝ ██╔══██║
███████╗██║  ██║██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██║     ██║  ██║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝
```
 
# 🧠 LangGraph Multi-Agent Systems with Nextjs connection. No SDK. No Templates, ALL CUSTOM BUILD
 
**The only repo where LangGraph agents run raw, stream real, and think deep.**
**Available in TypeScript AND Python. Because why choose one language when you can dominate both.**

---

---
 
<!-- Agent Framework -->
[![LangGraph](https://img.shields.io/badge/LangGraph-Custom_Multi--Agents-blueviolet?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==)](https://langchain-ai.github.io/langgraph/)
[![LangChain](https://img.shields.io/badge/LangChain-Powered-1C3C3C?style=for-the-badge)](https://langchain.com)
[![LangSmith](https://img.shields.io/badge/LangSmith-Traced_%F0%9F%94%AD-orange?style=for-the-badge)](https://smith.langchain.com)
[![Mem0](https://img.shields.io/badge/Mem0-Memory_Layer-8B5CF6?style=for-the-badge)](https://mem0.ai)
 
<!-- Languages & Runtime -->
[![TypeScript](https://img.shields.io/badge/TypeScript-YES-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-YES-FFD43B?style=for-the-badge&logo=python)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-SSE_Streaming-000?style=for-the-badge&logo=next.js)](https://nextjs.org)
 
<!-- LLMs -->
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT_Powered-412991?style=for-the-badge&logo=openai)](https://openai.com)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-CC785C?style=for-the-badge)](https://anthropic.com)
 
<!-- Tools & APIs -->
[![Tavily](https://img.shields.io/badge/Tavily-AI_Search-00C2A8?style=for-the-badge)](https://tavily.com)
[![SerpAPI](https://img.shields.io/badge/SerpAPI-Scholar_%7C_Patents_%7C_News-4285F4?style=for-the-badge)](https://serpapi.com)
[![Firecrawl](https://img.shields.io/badge/Firecrawl-Web_Scraping-FF6B35?style=for-the-badge)](https://firecrawl.dev)
 
 ---
 
## 📸 Screenshots
 
<div align="center">
| Customer Agent | Research System |
|---|---|
| ![App 1](assets/app1.png) | ![App 2](assets/app2.png) |
 
| Research Output | Agent Architecture |
|---|---|
| ![App 3](assets/app3.png) | ![Diagram](assets/dia-1.png) |
 
</div>
---
---
 
⭐ **Star this repo if you're tired of wrapper tutorials.** ⭐
 
---
 
```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📚  FOR LEARNING & TESTING PURPOSES ONLY                   ║
║                                                              ║
║   Got questions? Found a bug? Just wanna talk agents?        ║
║   Feel free to reach out — always happy to connect.          ║
║                                                              ║
║   📧  raironit127@gmail.com                                  ║
║   💼  linkedin.com/in/rox-aa53a1300                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
 
---
 
> **"Everyone wraps the SDK. We write the graph."**

## Why This Repo Stands Out

Most LangGraph examples are either basic chains or over-hyped demos with heavy abstractions.  

This project is different.

It showcases **real multi-agent reasoning** using **ReAct agents**, **interrupts**, **human-in-the-loop (HITL)** flows, and **custom streaming** — all connected through clean, production-minded architecture.

### Key Highlights

- **Dual Implementation**: Full LangGraph + LangChain + LangSmith + **Mem0** in **both TypeScript** (`my-agent-ts`) and **Python** (`my-agent-py`). Side-by-side comparison for the community.
- **ReAct Agents with Multi-Agent Reasoning**: Agents that can think, use tools, reflect, and hand off to other specialized agents.
- **Human-in-the-Loop (HITL)**: Real interrupt patterns for approval, correction, or escalation.
- **Custom SSE Streaming**: Built from scratch using Next.js API routes — no LangChain SDKs, no third-party streaming wrappers.
- **Full Observability**: LangSmith tracing enabled by default.
- **Memory Layer**: Mem0 for persistent session context across interactions.(for demo purpose not integrated inside code).
- **Real Tool Calling**: Tavily, Firecrawl, SerpAPI, plus custom CRUD tools.
- **Clean Architecture**: Separate client (Next.js + pnpm) and server (Python + Poetry) layers with custom real-time log streaming.

---

 
## 📁 Repository Structure
 
```
agents/
├── assets/                        # 📸 Screenshots & diagrams
│   ├── app1.png
│   ├── app2.png
│   ├── app3.png
│   └── dia-1.png
│
├── my-agent-ts/                   # 🟦 LangGraph in TypeScript — fundamentals
├── my-agent-py/                   # 🐍 LangGraph in Python — same concepts, same power
│
├── customer-agent-client/         # 🛍️ Next.js frontend — customer service UI
├── customer-py-server/            # ⚙️ FastAPI backend — REACT agent + HITL
│
├── multi-research-client/         # 🔬 Research UI — real-time agent logs
├── multi-research-server/         # 🧠 The beast — 4-agent research orchestrator
│
├── .gitignore
├── README.md                      # You are here 📍
├── requirements.txt
└── tools_reference_card.html
```


# 🧩 Part 1 — `my-agent-ts` & `my-agent-py`
 
## The Foundation. Where It All Starts.
 
> Learn LangGraph the real way — by writing the graph yourself, in both languages.

.env setup ->
```dotenv
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_key_here
LANGSMITH_PROJECT=

--for client side--

NEXT_PUBLIC_AGENT_URL=http://127.0.0.1:8000  (chnage as per your domain)
```

# 🛍️ Part 2 — Customer Agent System
 
## Supervisor → REACT Sub-Agents → HITL. Streamed via Raw SSE.
 
> A production-pattern customer support agent backed by a fake DB — real graph, real interrupt logic, sandboxed data.
 
### Graph Architecture
 
```
              START
                │
       ┌────────▼────────┐
       │   supervisor    │  ← gpt-4.1-nano, streaming=True
       │  binds 3 tools  │    (routing descriptors only, never executed)
       └────────┬────────┘
                │ assign_tool() — conditional edge via Send()
     ┌──────────┼──────────┐
     │          │          │
┌────▼─────┐ ┌──▼──────┐ ┌─▼────────────────┐
│order_    │ │refund_  │ │update_order      │
│agent     │ │agent    │ │── HITL ⏸️        │
│          │ │         │ │interrupt() pauses│
│ReAct loop│ │ReAct    │ │graph until human │
│          │ │loop     │ │input is received │
│get_order │ │check_   │ │then writes DB    │
│list_cust │ │eligibi- │ │on "approve"      │
│_orders   │ │lity     │ │                  │
│          │ │process_ │ │                  │
│          │ │refund   │ │                  │
└────┬─────┘ └──┬──────┘ └─────────┬────────┘
     └──────────┴──────────────────┘
                │  ToolMessage → back to supervisor
       ┌────────▼────────┐
       │   supervisor    │  synthesizes + responds to customer
       └─────────────────┘
```
 
### Nodes & Tools (from the actual code)
 
**`supervisor`** — main LLM. Binds 3 routing descriptor tools. LLM signals intent by calling them; `assign_tool` intercepts and fans out via `Send()`. No tool ever executes in supervisor — pure routing signal.
 
**`order_agent`** — ReAct subagent (`create_react_agent`)
```python
tools: [get_order, list_customer_orders]
# get_order(order_id)        → returns order + merged customer info from fake DB
# list_customer_orders(name) → fuzzy name match, returns all matching orders
```
 
**`refund_agent`** — ReAct subagent (`create_react_agent`)
```python
tools: [check_refund_eligibility, process_refund]
# check_refund_eligibility(order_id) → checks status: delivered/shipped = eligible
# process_refund(order_id, reason)   → mutates ORDERS dict, writes to REFUNDS dict
#                                      returns refund_id on success
```
 
**`update_order`** — HITL node (not a ReAct agent)
```python
# 1. Validates order_id exists in ORDERS dict
# 2. interrupt({order_id, product, current_status, new_status, reason, amount})
#    → graph FREEZES. Frontend receives payload, shows approval card.
# 3. On resume:
#    approval == "approve" → ORDERS[order_id]["status"] = new_status
#    anything else         → cancelled, no DB write
# 4. Returns ToolMessage → supervisor informs customer
```
 
### Custom Stream Events
Each node emits a custom event via `get_stream_writer()` before doing work — frontend gets per-agent status cards over SSE in real time:
```python
writer({"agent_status": {"agent": "order_agent", "status": f"Looking up: {query}"}})
```
 
### Edge Map
```
START → supervisor
supervisor →[assign_tool]→ order_agent | refund_agent | update_order | END
order_agent   → supervisor
refund_agent  → supervisor
update_order  → supervisor
```
`InMemorySaver` checkpointer preserves full state across the HITL pause/resume.
 
---

# 🔬 Part 3 — Multi-Research System
 
## Lead Agent → 2 ReAct Researchers → Citation Agent → HITL Docx. All Streaming.
 
> 4-agent research MAS. Real tool calls. Real sources. Cited report. Downloadable `.docx`. Max `MAX_ITERATIONS=3` research loops before forced synthesis.

# 🔑 Environment Variables

```bash
# LangSmith — Observability
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_key
LANGSMITH_PROJECT=learning
 
# LLMs
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
 
# Search & Scraping
TAVILY_API_KEY=your_key
SERPAPI_API_KEY=your_key
FIRECRAWL_API_KEY=your_key
 
# Memory
MEM0_API_KEY=your_key
```
 
### Graph Architecture
 
```
              START
                │
       ┌────────▼──────────────────┐
       │       supervisor          │  ← gpt-4.1-mini (planning + synthesis)
       │  (Lead Researcher)        │    binds: ask_researcher_a
       │                           │           ask_researcher_b
       │  1. Plans research        │           create_document
       │  2. Delegates in parallel │
       │  3. Synthesizes findings  │
       │  4. Loops (max 3x)        │
       │  5. Calls create_document │
       └────────┬──────────────────┘
                │ assign_tool() — Send-based parallel fan-out
        ┌───────┴───────┐
        │               │
┌───────▼──────┐  ┌──────▼──────────┐
│ researcher_a │  │ researcher_b    │
│              │  │                 │
│ ReAct loop   │  │ ReAct loop      │
│ gpt-4.1-nano │  │ gpt-4.1-nano    │
│              │  │                 │
│ tavily_web_  │  │ tavily_web_     │
│ search       │  │ search          │
│ tavily_      │  │ serp_patent_    │
│ extract(url) │  │ search          │
│ serp_scholar_│  │ serp_news_      │
│ search       │  │ search          │
└───────┬──────┘  └──────┬──────────┘
        └───────┬─────────┘
                │  findings[] + ToolMessage → supervisor
       ┌────────▼──────────────────┐
       │       supervisor          │  decides: loop again OR call create_document
       └────────┬──────────────────┘
                │ assign_tool → Send("hitl_document", enriched_tool_call)
       ┌────────▼──────────────────┐
       │     hitl_document         │
       │                           │
       │  1. citation_agent runs   │  ← single LLM call, not ReAct
       │     (inserts [1][2]       │    regex extracts URLs from findings
       │      inline citations +   │    asks _subagent_llm to annotate
       │      ## References)       │
       │                           │
       │  2. interrupt(payload) ⏸️ │  ← graph FREEZES
       │     {summary, filename,   │    frontend shows approval card
       │      report_preview,      │    with word_count + citation badge
       │      word_count}          │
       │                           │
       │  3. On "approve":         │
       │     _write_docx() runs    │  ← writes Node.js script to /tmp
       │     → node script.js      │    uses docx npm library
       │     → {filename}.docx     │    structured headings, bullets, styles
       │     saved to /tmp/        │
       └────────┬──────────────────┘
                │ ToolMessage → supervisor → final response
       ┌────────▼──────────────────┐
       │       supervisor          │  END
       └───────────────────────────┘
```
 
### State (`ResearchState`)
```python
class ResearchState(MessagesState):
    research_plan: str                          # supervisor's breakdown
    findings: Annotated[list, operator.add]     # [{agent, aspect, query, summary}] — reducer appends
    active_statuses: Annotated[dict, operator.ior]  # per-agent live status — reducer merges
    hitl_data: dict                             # last interrupt payload (persistent for UI)
    final_report: str                           # cited markdown after synthesis
    iterations: Annotated[int, operator.add]    # loop counter, capped at MAX_ITERATIONS=3
    user_id: str
```
 
### Tools (real implementations)
 
**Researcher A tools:**
```python
tavily_web_search(query, max_results=5)  # search_depth="advanced", returns title+url+snippet
tavily_extract(url)                      # full raw_content up to 3000 chars
serp_scholar_search(query)               # google_scholar engine, 5 results, includes year
```
 
**Researcher B tools:**
```python
tavily_web_search(query, max_results=5)  # cross-verification searches
serp_patent_search(query)                # google_patents engine — short 3-6 word queries only
serp_news_search(query)                  # google tbm=nws, 5 results with source + date
```
 
### Custom Stream Events (per node)
```python
# researcher_a / researcher_b emit before and after their ReAct loop:
writer({"active_statuses": {
    "researcher_a": {"agent": "researcher_a", "status": f"Phase: Researching {aspect}",
                     "query": query, "start_time": time.time()}
}})
# is_done: True emitted on completion — UI clears the loading state
```
`hitl_document` also emits `citation_agent` status events and `doc_render` events — frontend tracks all 4 agents independently.
 
### Docx Generation
After HITL approval, `_write_docx()` writes a Node.js script to `/tmp`, executes it via `subprocess`, and uses the `docx` npm library to produce a structured `.docx` with proper heading styles, bullet numbering, font config (Arial 12pt), and page margins — not a plain text file.
 
### Edge Map
```
START → supervisor
supervisor →[assign_tool]→ researcher_a | researcher_b | hitl_document | END
researcher_a  → supervisor   (loop until MAX_ITERATIONS or create_document)
researcher_b  → supervisor
hitl_document → supervisor
```
`InMemorySaver` checkpointer. Mem0 integration scaffolded — ready to activate once OAuth `user_id` is available.
 
---

## ⚡ Streaming Architecture — How It Actually Works
 
```
Browser                Next.js              FastAPI              LangGraph
   │                      │                    │                     │
   │── fetch('/api/run')──►│                    │                     │
   │                      │──── POST /stream ──►│                     │
   │                      │                    │──── graph.astream ──►│
   │                      │                    │                     │
   │                      │                    │◄── node: "lead" ────│
   │◄── data: {node} ─────│◄── SSE event ──────│                     │
   │                      │                    │◄── tool_call ───────│
   │◄── data: {tool} ─────│◄── SSE event ──────│                     │
   │                      │                    │◄── token, token ────│
   │◄── data: {token} ────│◄── SSE event ──────│                     │
   │                      │                    │◄── END ─────────────│
   │◄── data: [DONE] ─────│◄── SSE event ──────│                     │
```
 
**Zero SDK wrapping the stream. Zero abstraction hiding the events.**
Raw `text/event-stream`. Raw `ReadableStream`. Raw power.