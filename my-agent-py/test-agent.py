# ============================================================
# 🎫 TICKET & ISSUE RESOLVER AGENT
# LangGraph + Human-in-the-loop with interrupt()
# ============================================================
# What you'll see here:
#   ✅ interrupt() INSIDE tools — pauses graph before real actions
#   ✅ Command(resume=...) — resumes the graph with human's decision
#   ✅ User can EDIT fields before approving (not just yes/no)
#   ✅ Side effects AFTER interrupt — safe, never runs if rejected
#   ✅ MemorySaver — required for interrupts (state must be checkpointed)
#   ✅ Full CLI REPL with the approve → resume loop built in
# ============================================================

import json
import uuid
from datetime import datetime
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command

load_dotenv()

# ────────────────────────────────────────────────────────────
# 🗃️  MOCK DATABASE
# In production → your real Postgres / API calls
# ────────────────────────────────────────────────────────────

TICKETS_DB: dict  = {}
MEETINGS_DB: dict = {}

# ────────────────────────────────────────────────────────────
# 🔧 TOOLS
# The key pattern: interrupt() is INSIDE the tool.
# graph pauses here, human approves/edits, then tool continues.
# ────────────────────────────────────────────────────────────

@tool
def get_ticket(ticket_id: str) -> str:
    """Retrieve an existing ticket by its ID (e.g. TKT-A1B2C3)."""
    ticket = TICKETS_DB.get(ticket_id)
    if not ticket:
        return json.dumps({"error": f"Ticket {ticket_id} not found."})
    return json.dumps(ticket, indent=2)


@tool
def create_ticket(title: str, description: str, priority: str = "medium") -> str:
    """
    Create a support ticket to track the user's issue.
    priority: 'low' | 'medium' | 'high' | 'critical'
    Only call this after discussing the issue with the user.
    """
    # ── INTERRUPT ── graph pauses here, state saved to checkpointer
    # The dict we pass surfaces to the REPL as interrupt_data.
    # The value returned by interrupt() = whatever Command(resume=...) sends back.
    decision = interrupt({
        "action":  "create_ticket",
        "message": "About to create this ticket. Approve?",
        "details": {
            "title":       title,
            "description": description,
            "priority":    priority,
        },
    })

    # Human rejected → cancel cleanly, no DB write
    if not decision.get("approved", False):
        return json.dumps({"status": "cancelled", "reason": "Rejected by user."})

    # Side effects ONLY after interrupt() returns with approval.
    # This is the rule: never write to DB before interrupt().
    # If the node re-runs on resume, the interrupt fires again first —
    # so the DB write is protected and only happens once.
    ticket_id = f"TKT-{uuid.uuid4().hex[:6].upper()}"
    ticket = {
        "id":          ticket_id,
        "title":       decision.get("title",       title),        # user may have edited
        "description": decision.get("description", description),
        "priority":    decision.get("priority",    priority),
        "status":      "open",
        "created_at":  datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    TICKETS_DB[ticket_id] = ticket
    return json.dumps({"status": "created", "ticket": ticket}, indent=2)


@tool
def book_meet(topic: str, preferred_date: str, user_name: str, user_email: str) -> str:
    """
    Book a meeting with a human support engineer.
    preferred_date: e.g. '2025-04-15 14:00'
    Only use this when the issue genuinely needs human expert involvement.
    """
    # ── INTERRUPT ── same pattern, different action
    decision = interrupt({
        "action":  "book_meet",
        "message": "About to book this meeting. Approve?",
        "details": {
            "topic":  topic,
            "date":   preferred_date,
            "name":   user_name,
            "email":  user_email,
        },
    })

    if not decision.get("approved", False):
        return json.dumps({"status": "cancelled", "reason": "Rejected by user."})

    meet_id = f"MEET-{uuid.uuid4().hex[:6].upper()}"
    meeting = {
        "id":            meet_id,
        "topic":         decision.get("topic", topic),
        "date":          decision.get("date",  preferred_date),
        "name":          decision.get("name",  user_name),
        "email":         decision.get("email", user_email),
        "status":        "confirmed",
        "calendar_link": f"https://cal.example.com/{meet_id}",
    }
    MEETINGS_DB[meet_id] = meeting
    return json.dumps({"status": "booked", "meeting": meeting}, indent=2)


TOOLS   = [get_ticket, create_ticket, book_meet]
TOOLMAP = {t.name: t for t in TOOLS}

# ────────────────────────────────────────────────────────────
# 🤖 MODEL + SYSTEM PROMPT
# ────────────────────────────────────────────────────────────

model = init_chat_model("gpt-4.1-nano", temperature=0).bind_tools(TOOLS)

SYSTEM = """You are a friendly and efficient support agent. Your goals:

1. Understand the user's issue through conversation — ask questions first.
2. Try to resolve it yourself before escalating.
3. If the issue needs tracking → create_ticket (you must confirm with the user first).
4. If the issue needs a human expert → book_meet (confirm first, collect their name + email).
5. Use get_ticket if the user mentions a ticket ID.

Be warm, concise, and conversational. Don't jump to tools immediately."""

# ────────────────────────────────────────────────────────────
# 📐 LANGGRAPH — nodes + edges
# ────────────────────────────────────────────────────────────

def call_model(state: MessagesState) -> dict:
    messages  = [SystemMessage(SYSTEM)] + state["messages"]
    response  = model.invoke(messages)
    return {"messages": [response]}


def call_tools(state: MessagesState) -> dict:
    last    = state["messages"][-1]      # AIMessage with tool_calls
    results = []
    for tc in last.tool_calls:
        fn  = TOOLMAP[tc["name"]]
        out = fn.invoke(tc["args"])      # ← interrupt() fires inside here if tool has one
        results.append(ToolMessage(
            content      = str(out),
            tool_call_id = tc["id"],
            name         = tc["name"],
        ))
    return {"messages": results}


def should_continue(state: MessagesState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


# Build graph
builder = StateGraph(MessagesState)
builder.add_node("model", call_model)
builder.add_node("tools", call_tools)
builder.add_edge(START, "model")
builder.add_conditional_edges("model", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "model")

# MemorySaver is REQUIRED for interrupt() to work.
# Without a checkpointer, the graph can't save state → can't resume.
memory = MemorySaver()
graph  = builder.compile(checkpointer=memory)

# ────────────────────────────────────────────────────────────
# 🖥️  DISPLAY HELPERS
# ────────────────────────────────────────────────────────────

BAR = "─" * 60

def show_step(step: dict) -> None:
    """Print what each graph node produced."""

    if "model" in step:
        msg = step["model"]["messages"][-1]
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                print(f"\n  🔧  Calling → {tc['name']}")
                print(f"      {json.dumps(tc['args'])}")
        elif msg.content:
            print(f"\n  🤖  {msg.content}")

    elif "tools" in step:
        for tm in step["tools"]["messages"]:
            try:
                data   = json.loads(tm.content)
                status = data.get("status", "")
                if status == "cancelled":
                    print(f"\n  ✗   [{tm.name}] cancelled — {data.get('reason','')}")
                elif status == "created":
                    t = data["ticket"]
                    print(f"\n  ✓   Ticket created → {t['id']} | {t['priority'].upper()} | {t['title']}")
                elif status == "booked":
                    m = data["meeting"]
                    print(f"\n  ✓   Meeting booked → {m['id']} on {m['date']}")
                    print(f"      Link: {m['calendar_link']}")
                else:
                    print(f"\n  ✅  [{tm.name}] → {tm.content[:120]}")
            except Exception:
                print(f"\n  ✅  [{tm.name}] → {tm.content[:120]}")


def handle_interrupt(payload: dict) -> dict:
    """
    Show the interrupt payload, collect the human's decision.
    Returns the dict that becomes the return value of interrupt() inside the tool.

    Supports:
      y / yes      → approve with original details
      n / no       → reject
      field=value  → edit a field, then loop back for approval
    """
    action  = payload.get("action", "action")
    message = payload.get("message", "Confirm?")
    details = dict(payload.get("details", {}))   # mutable copy for edits

    print(f"\n  {'─'*56}")
    print(f"  ⚠️   APPROVAL NEEDED — {action.replace('_', ' ').upper()}")
    print(f"  {message}")
    print(f"  {'─'*56}")
    for k, v in details.items():
        print(f"  {k:<15} {v}")
    print(f"  {'─'*56}")
    print("  [y] approve   [n] reject   [field=value] edit before approving")

    while True:
        raw = input("  Decision ▸ ").strip()

        if raw.lower() in ("y", "yes", ""):
            print("  ✓  Approved.")
            return {"approved": True, **details}

        elif raw.lower() in ("n", "no"):
            print("  ✗  Rejected.")
            return {"approved": False}

        elif "=" in raw:
            field, _, value = raw.partition("=")
            field = field.strip()
            value = value.strip()
            if field in details:
                details[field] = value
                print(f"  ✎  {field} → {value}")
                print(f"  Updated: {details}")
            else:
                print(f"  Unknown field '{field}'. Valid: {list(details.keys())}")

        else:
            print("  Type y, n, or field=value to edit.")

# ────────────────────────────────────────────────────────────
# 🔁 THE CORE LOOP — this is what makes HITL work
# ────────────────────────────────────────────────────────────

def run_turn(user_input: str, config: dict) -> None:
    """
    Run one conversation turn, handling interrupt → approve → resume internally.

    The while True loop is the key insight:
      1. Stream the graph with current_input
      2. If graph hits interrupt() → collect human decision
      3. Set current_input = Command(resume=decision) → loop back
      4. Graph resumes from the exact checkpoint, tool continues
      5. If no interrupt → graph finished → break
    """
    print(f"\n{BAR}")
    print(f"  You: {user_input}")
    print(BAR)

    current_input = {"messages": [HumanMessage(user_input)]}

    while True:
        interrupted    = False
        interrupt_data = None

        # Stream this invocation step by step
        for step in graph.stream(current_input, config, stream_mode="updates"):

            if "__interrupt__" in step:
                # interrupt() was called inside a tool.
                # The graph has saved state and is waiting.
                interrupted    = True
                interrupt_data = step["__interrupt__"][0].value
                # Don't break — consume remaining chunks first

            else:
                show_step(step)

        if not interrupted:
            break   # Graph finished cleanly — done with this turn

        # ── HUMAN DECISION ──────────────────────────────────
        # Graph is paused. Ask the human right now in the terminal.
        decision = handle_interrupt(interrupt_data)

        # Command(resume=decision) → becomes the return value
        # of interrupt() inside the tool when graph resumes.
        current_input = Command(resume=decision)

        # Loop → graph.stream fires again from the checkpoint.
        # The tool sees decision and either creates the ticket or cancels.
        # Then model runs again to tell the user what happened.

# ────────────────────────────────────────────────────────────
# 💬 CLI REPL
# ────────────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 60)
    print("  🎫  SUPPORT AGENT  —  LangGraph + Human-in-the-loop")
    print("═" * 60)
    print("  Describe your issue. I'll try to help, and ask for")
    print("  approval before creating tickets or booking meetings.")
    print("  Type 'exit' to quit.\n")

    print("  Try these:")
    print("    → My login stopped working after your last update")
    print("    → Check ticket TKT-ABC123")
    print("    → I need to talk to someone about a billing problem")
    print()

    # thread_id scopes the memory.
    # Same ID across turns = agent remembers the full conversation.
    config = {"configurable": {"thread_id": "support-001"}}

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