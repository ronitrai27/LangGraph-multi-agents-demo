# ============================================================
# 🤖 MULTI-AGENT SYSTEM — Supervisor + 2 Subagents
# ============================================================
# Architecture:
#
#   User query
#       ↓
#   Supervisor (GPT-4o-mini) — reads query, decides who to call
#       ↓
#   ┌─────────────────────────────────┐
#   │  web_agent (Claude claude-sonnet-4-6) │  db_agent (GPT-4o-mini)  │
#   │  tool: firecrawl_search   │  tool: get_product        │
#   │  tool: firecrawl_scrape   │  tool: get_user           │
#   └─────────────────────────────────┘
#       ↓
#   Supervisor synthesises subagent result → final answer
#       ↓
#   User
#
# Key concepts in this file:
#   ✅ create_agent() for each subagent — different LLM per agent
#   ✅ Hand-built parent graph — supervisor owns routing
#   ✅ State carries subagent_result between nodes
#   ✅ Streaming at every layer — supervisor tokens + tool calls
#   ✅ Firecrawl web search as a real external API
# ============================================================

import os
import json
import requests
from dotenv import load_dotenv
from typing import Literal
from typing_extensions import NotRequired

from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain.agents import create_agent, AgentState
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver

load_dotenv()

FIRECRAWL_KEY = os.getenv("FIRECRAWL_API_KEY")

# ────────────────────────────────────────────────────────────
# 📐 STATE
# Extends AgentState (which extends MessagesState) with two extra fields:
#   active_agent   — which subagent the supervisor picked
#   subagent_result — what that subagent returned (injected into synthesise step)
# ────────────────────────────────────────────────────────────

class SupervisorState(AgentState):
    active_agent:    NotRequired[str]   # "web_search" | "db_lookup" | "direct"
    subagent_result: NotRequired[str]   # raw result from whichever subagent ran

# ────────────────────────────────────────────────────────────
# 🔧 WEB SEARCH TOOLS — Firecrawl (for web_agent / Claude)
# ────────────────────────────────────────────────────────────

@tool
def firecrawl_search(query: str, limit: int = 5) -> str:
    """
    Search the web using Firecrawl and return top results with content.
    Use for current events, news, product info not in the internal DB.
    """
    payload = {
        "query": query,
        "sources": ["web"],
        "limit": limit,
        "scrapeOptions": {
            "onlyMainContent": True,
            "formats": ["markdown"],
        }
    }
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        "https://api.firecrawl.dev/v2/search",
        json=payload,
        headers=headers,
        timeout=30,
    )
    data = resp.json()

    if not data.get("success"):
        return json.dumps({"error": "Firecrawl search failed", "details": data})

    results = []
    for r in data.get("data", [])[:limit]:
        results.append({
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "content": r.get("markdown", r.get("description", ""))[:500],
        })
    return json.dumps(results, indent=2)


@tool
def firecrawl_scrape(url: str) -> str:
    """
    Scrape a specific URL and return its full content as markdown.
    Use when you have a specific page URL and need the full content.
    """
    payload = {
        "url": url,
        "formats": ["markdown"],
        "onlyMainContent": True,
    }
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        "https://api.firecrawl.dev/v1/scrape",
        json=payload,
        headers=headers,
        timeout=30,
    )
    data = resp.json()
    if not data.get("success"):
        return json.dumps({"error": "Scrape failed", "details": data})

    content = data.get("data", {}).get("markdown", "")
    return content[:2000]   # cap at 2000 chars to avoid token explosion

# ────────────────────────────────────────────────────────────
# 🔧 DB TOOLS — Mock database (for db_agent / GPT)
# ────────────────────────────────────────────────────────────

PRODUCTS_DB = {
    "PRD-001": {"id": "PRD-001", "name": "Pro Plan",        "price": "$49/mo",  "features": ["Unlimited projects","10 users","API access"]},
    "PRD-002": {"id": "PRD-002", "name": "Starter Plan",    "price": "$9/mo",   "features": ["3 projects","1 user","Email support"]},
    "PRD-003": {"id": "PRD-003", "name": "Enterprise Plan", "price": "$299/mo", "features": ["Unlimited everything","SLA","Custom integrations"]},
}

USERS_DB = {
    "USR-001": {"id": "USR-001", "name": "Rahul",   "plan": "PRD-001", "status": "active",   "joined": "2024-01-15"},
    "USR-002": {"id": "USR-002", "name": "Alice",   "plan": "PRD-003", "status": "active",   "joined": "2023-08-20"},
    "USR-003": {"id": "USR-003", "name": "Bob",     "plan": "PRD-002", "status": "inactive", "joined": "2024-03-10"},
}

ORDERS_DB = {
    "ORD-001": {"id": "ORD-001", "user_id": "USR-001", "product": "PRD-001", "status": "active",    "date": "2025-01-01"},
    "ORD-002": {"id": "ORD-002", "user_id": "USR-002", "product": "PRD-003", "status": "active",    "date": "2024-09-01"},
    "ORD-003": {"id": "ORD-003", "user_id": "USR-003", "product": "PRD-002", "status": "cancelled", "date": "2024-03-10"},
}


@tool
def get_product(product_id: str) -> str:
    """Look up a product by ID (e.g. PRD-001). Returns pricing and features."""
    p = PRODUCTS_DB.get(product_id.upper())
    return json.dumps(p) if p else json.dumps({"error": f"{product_id} not found"})


@tool
def get_user(user_id: str) -> str:
    """Look up a user by ID (e.g. USR-001). Returns profile and plan info."""
    u = USERS_DB.get(user_id.upper())
    return json.dumps(u) if u else json.dumps({"error": f"{user_id} not found"})


@tool
def get_order(order_id: str) -> str:
    """Look up an order by ID (e.g. ORD-001). Returns order details and status."""
    o = ORDERS_DB.get(order_id.upper())
    return json.dumps(o) if o else json.dumps({"error": f"{order_id} not found"})


@tool
def list_all_products() -> str:
    """List all available products and their pricing."""
    return json.dumps(list(PRODUCTS_DB.values()), indent=2)

# ────────────────────────────────────────────────────────────
# 🤖 SUBAGENTS — each is a full create_agent with its own LLM
# ────────────────────────────────────────────────────────────

# Web Agent — Claude claude-sonnet-4-6 (better at reading/summarising web content)
web_agent = create_agent(
    "anthropic:claude-sonnet-4-6",
    tools=[firecrawl_search, firecrawl_scrape],
    system_prompt="""You are a web research specialist.
Search the web to find accurate, current information.
Always search first, then summarise clearly.
Include sources (URLs) in your response.
Be concise — return only what's relevant to the query.""",
)

# DB Agent — GPT-4o-mini (fast and accurate for structured lookups)
db_agent = create_agent(
    "openai:gpt-4.1-nano",
    tools=[get_product, get_user, get_order, list_all_products],
    system_prompt="""You are an internal database specialist.
Look up accurate data from the company's internal systems.
Always use the provided tools to fetch real data.
Return factual, structured information only.""",
)

# ────────────────────────────────────────────────────────────
# 🧠 SUPERVISOR — GPT-4o-mini, hand-built node
# Decides which subagent to route to, then synthesises the result.
# ────────────────────────────────────────────────────────────

supervisor_model = init_chat_model("gpt-4.1-nano", temperature=0)

SUPERVISOR_DECIDE_PROMPT = """You are a supervisor that routes user queries to specialist agents.

Available agents:
  web_search — searches the live internet. Use for: current news, real-world facts,
               company info, prices from external sites, anything not in our internal DB.
  db_lookup  — queries our internal database. Use for: our product plans, user accounts,
               orders, internal pricing, customer data.
  direct     — answer directly without any agent. Use for: greetings, clarifying questions,
               or anything you can answer confidently without external data.

User query: {query}

Respond with ONLY one word: web_search, db_lookup, or direct"""

SUPERVISOR_SYNTHESISE_PROMPT = """You are a helpful assistant. Answer the user's query
using the research result below. Be concise and direct.

User query: {query}
Research result: {result}

Provide a clear, friendly answer."""


def supervisor_decide(state: SupervisorState) -> dict:
    """
    Reads the last user message and decides which agent to route to.
    Returns active_agent which the conditional edge reads.
    """
    last_human = next(
        (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        ""
    )
    prompt = SUPERVISOR_DECIDE_PROMPT.format(query=last_human)
    response = supervisor_model.invoke([SystemMessage(prompt)])
    decision = response.content.strip().lower()

    # Normalise — LLM sometimes adds punctuation
    if "web" in decision:
        decision = "web_search"
    elif "db" in decision:
        decision = "db_lookup"
    else:
        decision = "direct"

    print(f"\n  🧭  Supervisor decided → {decision}")
    return {"active_agent": decision}


def run_web_agent(state: SupervisorState) -> dict:
    """Invoke the web search subagent (Claude). Returns result in subagent_result."""
    last_human = next(
        (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        ""
    )
    print(f"\n  🌐  Web Agent (Claude claude-sonnet-4-6) working...")
    # Pass only the current user query — not the full message history.
    # This is the context engineering principle from the docs:
    # subagents get focused context, not the supervisor's full conversation.
    result = web_agent.invoke({"messages": [HumanMessage(last_human)]})
    final  = result["messages"][-1].content
    print(f"  ✅  Web Agent done → {final[:100]}...")
    return {"subagent_result": final}


def run_db_agent(state: SupervisorState) -> dict:
    """Invoke the DB lookup subagent (GPT). Returns result in subagent_result."""
    last_human = next(
        (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        ""
    )
    print(f"\n  🗄️   DB Agent (GPT-4o-mini) working...")
    result = db_agent.invoke({"messages": [HumanMessage(last_human)]})
    final  = result["messages"][-1].content
    print(f"  ✅  DB Agent done → {final[:100]}...")
    return {"subagent_result": final}


def supervisor_synthesise(state: SupervisorState) -> dict:
    """
    Supervisor takes the subagent's result and writes the final user-facing response.
    Streams token by token — the user sees this appearing live.
    """
    last_human = next(
        (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        ""
    )
    result = state.get("subagent_result", "No result available.")
    prompt = SUPERVISOR_SYNTHESISE_PROMPT.format(query=last_human, result=result)

    print(f"\n  🤖  ", end="", flush=True)
    full_response = ""
    for chunk in supervisor_model.stream([SystemMessage(prompt)]):
        token = chunk.content
        print(token, end="", flush=True)
        full_response += token
    print()  # newline after stream

    return {"messages": [AIMessage(full_response)]}


def supervisor_direct(state: SupervisorState) -> dict:
    """Answer directly without calling any subagent. Streams response."""
    print(f"\n  🤖  ", end="", flush=True)
    full_response = ""
    for chunk in supervisor_model.stream([SystemMessage("You are a helpful assistant.")] + state["messages"]):
        token = chunk.content
        print(token, end="", flush=True)
        full_response += token
    print()

    return {"messages": [AIMessage(full_response)]}

# ────────────────────────────────────────────────────────────
# 🔀 ROUTING FUNCTION
# Reads active_agent from state → returns next node name
# ────────────────────────────────────────────────────────────

def route_to_agent(state: SupervisorState) -> Literal["web_agent", "db_agent", "direct"]:
    agent = state.get("active_agent", "direct")
    if agent == "web_search":
        return "web_agent"
    elif agent == "db_lookup":
        return "db_agent"
    return "direct"

# ────────────────────────────────────────────────────────────
# 📐 BUILD THE PARENT GRAPH
#
# START
#   ↓
# supervisor_decide  ──→ conditional edge reads active_agent
#   ↓          ↓          ↓
# web_agent  db_agent   direct
#   ↓          ↓
# supervisor_synthesise
#   ↓
# END
# ────────────────────────────────────────────────────────────

builder = StateGraph(SupervisorState)

builder.add_node("decide",     supervisor_decide)
builder.add_node("web_agent",  run_web_agent)
builder.add_node("db_agent",   run_db_agent)
builder.add_node("synthesise", supervisor_synthesise)
builder.add_node("direct",     supervisor_direct)

builder.add_edge(START, "decide")
builder.add_conditional_edges(
    "decide",
    route_to_agent,
    {
        "web_agent": "web_agent",
        "db_agent":  "db_agent",
        "direct":    "direct",
    }
)

# Both subagents feed into synthesise before ending
builder.add_edge("web_agent",  "synthesise")
builder.add_edge("db_agent",   "synthesise")
builder.add_edge("synthesise", END)
builder.add_edge("direct",     END)

memory = MemorySaver()
graph  = builder.compile(checkpointer=memory)

# ────────────────────────────────────────────────────────────
# 💬 CLI REPL
# ────────────────────────────────────────────────────────────

BAR = "─" * 60

def run_turn(user_input: str, config: dict) -> None:
    print(f"\n{BAR}")
    print(f"  You: {user_input}")
    print(BAR)

    # We use invoke (not stream) on the parent graph here
    # because streaming is handled manually inside each node
    # (supervisor_synthesise streams token by token directly).
    graph.invoke(
        {"messages": [HumanMessage(user_input)]},
        config,
    )
    print()


def main():
    print("\n" + "═" * 60)
    print("  🤖  MULTI-AGENT SYSTEM")
    print("  Supervisor (GPT) → Web Agent (Claude) | DB Agent (GPT)")
    print("═" * 60)
    print("  The supervisor routes your query to the right specialist.\n")
    print("  Try these:")
    print("    → What's the latest news about AI agents?       (→ web)")
    print("    → Show me the Pro Plan pricing                  (→ db)")
    print("    → Look up user USR-001                         (→ db)")
    print("    → What is Anthropic's latest model?            (→ web)")
    print("    → Show all our products                        (→ db)")
    print("    → Search for LangGraph tutorials               (→ web)")
    print("    → Hello!                                       (→ direct)")
    print()

    config = {"configurable": {"thread_id": "multi-agent-session-1"}}

    while True:
        try:
            user_input = input("You ▸ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n  Bye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            print("\n  Bye!")
            break

        run_turn(user_input, config)


if __name__ == "__main__":
    main()