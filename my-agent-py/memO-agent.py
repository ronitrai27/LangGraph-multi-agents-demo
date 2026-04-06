# ============================================================
# 🧠 CUSTOMER SUPPORT AGENT — LangGraph ReAct + Mem0 Memory
# ============================================================
# Architecture:
#   SHORT-TERM : MemorySaver (per-session message history)
#   LONG-TERM  : Mem0 (per-user facts, preferences, history)
#
# Flow every turn:
#   1. inject_memory node  → query Mem0 for this user's relevant facts
#                            inject into system prompt as context
#   2. model node          → LLM reasons with memory-enriched prompt
#   3. tools node          → execute tool calls (standard ReAct loop)
#   4. model node again    → synthesise final answer
#   5. After graph ends    → extract + store new facts to Mem0
#
# Testing strategy is at the bottom — read it before running.
# ============================================================

import json
import uuid
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain_core.messages import (
    HumanMessage, AIMessage, AIMessageChunk,
    SystemMessage, ToolMessage
)
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver
from typing import Annotated
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from mem0 import Memory

load_dotenv()

# ────────────────────────────────────────────────────────────
# 🧠 MEM0 SETUP
# Default config uses local vector store (qdrant in-memory).
# For production swap with:
#   config = {
#       "vector_store": {
#           "provider": "pgvector",
#           "config": {"url": "postgresql://..."}
#       }
#   }
#   mem0 = Memory.from_config(config)
# ────────────────────────────────────────────────────────────

mem0 = Memory()

# ────────────────────────────────────────────────────────────
# 🗃️  MOCK KNOWLEDGE BASE
# ────────────────────────────────────────────────────────────

ORDERS_DB = {
    "ORD-001": {"id": "ORD-001", "product": "Pro Plan",    "status": "active",    "amount": "$49/mo"},
    "ORD-002": {"id": "ORD-002", "product": "Starter Plan","status": "cancelled", "amount": "$9/mo"},
    "ORD-003": {"id": "ORD-003", "product": "Enterprise",  "status": "active",    "amount": "$299/mo"},
}

ISSUES_DB: dict = {}

# ────────────────────────────────────────────────────────────
# 🔧 TOOLS
# ────────────────────────────────────────────────────────────

@tool
def get_order(order_id: str) -> str:
    """Look up an order by ID (e.g. ORD-001). Returns order details and status."""
    order = ORDERS_DB.get(order_id.upper())
    if not order:
        return json.dumps({"error": f"Order {order_id} not found."})
    return json.dumps(order)


@tool
def search_faq(query: str) -> str:
    """
    Search the support knowledge base for answers.
    Use this before escalating — most common issues are answered here.
    """
    # Mock FAQ — in production this hits a vector DB
    faqs = {
        "refund":   "Refunds are processed within 5-7 business days to your original payment method.",
        "cancel":   "To cancel, go to Settings → Billing → Cancel Plan. Takes effect at period end.",
        "upgrade":  "Upgrade anytime from Settings → Billing. Prorated charge applied immediately.",
        "password": "Reset password at /forgot-password. Check spam folder for the email.",
        "slow":     "Clear browser cache and cookies. If persists, try incognito mode.",
        "billing":  "Billing runs on the 1st of each month. Invoices emailed 3 days prior.",
    }
    query_lower = query.lower()
    for keyword, answer in faqs.items():
        if keyword in query_lower:
            return json.dumps({"found": True, "answer": answer})
    return json.dumps({"found": False, "answer": "No FAQ match. Consider escalating to human support."})


@tool
def log_issue(summary: str, category: str, priority: str = "medium") -> str:
    """
    Log a support issue that couldn't be resolved immediately.
    category: 'billing' | 'technical' | 'account' | 'other'
    priority: 'low' | 'medium' | 'high'
    """
    issue_id = f"ISS-{uuid.uuid4().hex[:6].upper()}"
    ISSUES_DB[issue_id] = {
        "id": issue_id, "summary": summary,
        "category": category, "priority": priority,
        "status": "open"
    }
    return json.dumps({
        "logged": True,
        "issue_id": issue_id,
        "message": f"Issue {issue_id} logged. Team will respond within 24h."
    })


TOOLS   = [get_order, search_faq, log_issue]
TOOLMAP = {t.name: t for t in TOOLS}

# ────────────────────────────────────────────────────────────
# 📐 CUSTOM STATE
# Extends MessagesState with the user_id (needed for Mem0 scoping)
# and memory_context (injected facts from Mem0 for this turn).
# ────────────────────────────────────────────────────────────

class AgentState(MessagesState):
    user_id:        str    # identifies which user's Mem0 memories to load
    memory_context: str    # facts retrieved from Mem0, injected into system prompt

# ────────────────────────────────────────────────────────────
# 🤖 MODEL
# ────────────────────────────────────────────────────────────

model = init_chat_model("gpt-4.1-nano", temperature=0).bind_tools(TOOLS)

BASE_SYSTEM = """You are a warm, efficient customer support agent.

How to work:
1. Use the user context below (from memory) to personalise your response.
2. Search the FAQ first for common questions before logging issues.
3. Look up order details when an order ID is mentioned.
4. Log an issue only if the FAQ didn't help and you can't resolve it.
5. Be concise. Address the user by name if you know it.

{memory_context}"""

# ────────────────────────────────────────────────────────────
# 📐 NODES
# ────────────────────────────────────────────────────────────

def inject_memory(state: AgentState) -> dict:
    """
    BEFORE the model runs: query Mem0 for this user's relevant facts.
    Uses the last user message as the search query so only relevant
    memories are retrieved — not the entire history.
    Injects them into memory_context which the model node reads.
    """
    user_id    = state["user_id"]
    last_human = next(
        (m.content for m in reversed(state["messages"])
         if isinstance(m, HumanMessage)), ""
    )

    memories = mem0.search(last_human, user_id=user_id, limit=5)

    if memories and memories.get("results"):
        facts = [m["memory"] for m in memories["results"]]
        context = "Known facts about this user:\n" + "\n".join(f"  • {f}" for f in facts)
    else:
        context = "No prior memory for this user yet."

    print(f"\n  🧠  Memory retrieved ({len(memories.get('results', []))} facts):")
    for m in memories.get("results", []):
        print(f"      • {m['memory']}")

    return {"memory_context": context}


def call_model(state: AgentState) -> dict:
    """LLM node — uses memory_context to personalise the system prompt."""
    system  = BASE_SYSTEM.format(memory_context=state.get("memory_context", ""))
    messages = [SystemMessage(system)] + state["messages"]
    response = model.invoke(messages)
    return {"messages": [response]}


def call_tools(state: AgentState) -> dict:
    """Tool execution node — runs all tool_calls from last AIMessage."""
    last    = state["messages"][-1]
    results = []
    for tc in last.tool_calls:
        fn  = TOOLMAP[tc["name"]]
        out = fn.invoke(tc["args"])
        print(f"\n  ✅  [{tc['name']}] → {str(out)[:120]}")
        results.append(ToolMessage(
            content=str(out),
            tool_call_id=tc["id"],
            name=tc["name"],
        ))
    return {"messages": results}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END

# ────────────────────────────────────────────────────────────
# 📐 BUILD GRAPH
# inject_memory → model → (tools → model)* → END
#
# inject_memory runs ONCE per user turn, before the ReAct loop.
# The ReAct loop is model ↔ tools as before.
# ────────────────────────────────────────────────────────────

builder = StateGraph(AgentState)

builder.add_node("inject_memory", inject_memory)
builder.add_node("model",         call_model)
builder.add_node("tools",         call_tools)

builder.add_edge(START, "inject_memory")         # always start with memory retrieval
builder.add_edge("inject_memory", "model")       # then give enriched context to model
builder.add_conditional_edges("model", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "model")               # ReAct loop back

memory_saver = MemorySaver()                     # short-term: session message history
graph = builder.compile(checkpointer=memory_saver)

# ────────────────────────────────────────────────────────────
# 💾 MEMORY STORAGE — called AFTER each turn ends
# Extracts facts from the conversation and stores in Mem0.
# Runs outside the graph so it doesn't add latency to the response.
# ────────────────────────────────────────────────────────────

def save_turn_to_memory(user_message: str, ai_response: str, user_id: str) -> None:
    """
    Feed the turn to Mem0. It runs an internal LLM pass to decide
    what facts are worth extracting and storing.
    Examples of what Mem0 extracts:
      "Hi I'm Rahul" → stores "User's name is Rahul"
      "I'm on the Pro plan" → stores "User is on Pro plan"
      "I prefer bullet points" → stores "User prefers bullet point answers"
    """
    conversation = [
        {"role": "user",      "content": user_message},
        {"role": "assistant", "content": ai_response},
    ]
    result = mem0.add(conversation, user_id=user_id)
    new_memories = result.get("results", []) if isinstance(result, dict) else []
    if new_memories:
        print(f"\n  💾  Stored {len(new_memories)} new memory fact(s):")
        for m in new_memories:
            if m.get("event") in ("ADD", "UPDATE"):
                print(f"      + {m.get('memory', '')}")

# ────────────────────────────────────────────────────────────
# 🎬 STREAMING + TURN RUNNER
# ────────────────────────────────────────────────────────────

BAR = "─" * 60

def run_turn(user_input: str, user_id: str, session_config: dict) -> str:
    """
    Run one full turn:
      1. Stream the graph (inject_memory → model ↔ tools)
      2. Collect the final AI response
      3. Save the turn to Mem0 in the background
    Returns the final AI response text.
    """
    print(f"\n{BAR}")
    print(f"  You: {user_input}")
    print(BAR)

    final_response = ""
    answer_started = False

    for chunk in graph.stream(
        {"messages": [HumanMessage(user_input)], "user_id": user_id},
        session_config,
        stream_mode=["updates", "messages"],
    ):
        mode, data = chunk

        if mode == "messages":
            token, meta = data
            if (isinstance(token, AIMessageChunk)
                    and meta.get("langgraph_node") == "model"
                    and token.content):

                # Start answer line on first text token
                is_text = (
                    isinstance(token.content, str) or
                    (isinstance(token.content, list) and
                     any(isinstance(b, dict) and b.get("type") == "text"
                         for b in token.content))
                )
                if is_text:
                    if not answer_started:
                        print(f"\n  🤖  ", end="")
                        answer_started = True
                    text = (token.content if isinstance(token.content, str)
                            else "".join(b.get("text","") for b in token.content
                                        if isinstance(b, dict) and b.get("type")=="text"))
                    print(text, end="", flush=True)
                    final_response += text

        elif mode == "updates":
            if "model" in data:
                msg = data["model"]["messages"][-1]
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        print(f"\n  🔧  Calling → {tc['name']}({json.dumps(tc['args'])})")

    if answer_started:
        print()   # newline after streamed answer

    # ── Save this turn to Mem0 AFTER responding ──────────────
    # We do this after graph finishes so it doesn't slow the response.
    if final_response:
        save_turn_to_memory(user_input, final_response, user_id)

    print()
    return final_response

# ────────────────────────────────────────────────────────────
# 💬 CLI REPL
# ────────────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 60)
    print("  🧠  SUPPORT AGENT — LangGraph ReAct + Mem0 Memory")
    print("═" * 60)
    print("  The agent remembers you across sessions.")
    print("  Mention your name, plan, or preferences — it learns them.")
    print("  Type 'memories' to inspect what it knows. 'exit' to quit.\n")

    # In production this comes from your auth/JWT layer
    user_id = input("  Enter your user ID (or press Enter for 'user-demo'): ").strip()
    if not user_id:
        user_id = "user-demo"

    # thread_id = short-term session scope (MemorySaver)
    # user_id   = long-term user scope (Mem0)
    # They are independent — same user_id across different thread_ids
    thread_id      = f"session-{uuid.uuid4().hex[:8]}"
    session_config = {"configurable": {"thread_id": thread_id}}

    print(f"\n  User ID : {user_id}")
    print(f"  Session : {thread_id}")
    print(f"  {'─'*56}\n")

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

        # Special command: show what Mem0 knows about this user
        if user_input.lower() == "memories":
            all_mems = mem0.get_all(user_id=user_id)
            results  = all_mems.get("results", []) if isinstance(all_mems, dict) else []
            print(f"\n  🧠  All stored memories for '{user_id}':")
            if results:
                for m in results:
                    print(f"      • {m['memory']}")
            else:
                print("      (none yet — have a conversation first)")
            print()
            continue

        run_turn(user_input, user_id, session_config)


if __name__ == "__main__":
    main()