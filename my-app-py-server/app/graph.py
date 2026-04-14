# graph.py — the full LangGraph agent graph.
#
# Architecture:
#   supervisor (main LLM) ──► assign_tool (conditional edge using Send)
#       │
#       ├─► order_agent node   → invokes order ReAct subagent → ToolMessage → supervisor
#       ├─► refund_agent node  → invokes refund ReAct subagent → ToolMessage → supervisor
#       └─► update_order node  → interrupt() HITL → writes DB → ToolMessage → supervisor

import os
from langchain_core.messages import HumanMessage, ToolMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from langgraph.types import interrupt, Send
from langgraph.config import get_stream_writer
from langgraph.checkpoint.memory import InMemorySaver

from .fake_db import ORDERS, CUSTOMERS, REFUNDS


# ─────────────────────────────────────────────────────────────────────────────
# 1.  TOOLS 
# ─────────────────────────────────────────────────────────────────────────────

@tool
def get_order(order_id: str) -> dict:
    """Fetch a single order by its ID (e.g. ORD-001).
    Returns order details including product, status, amount, and customer info."""
    order = ORDERS.get(order_id.upper())
    if not order:
        return {
            "error": f"Order '{order_id}' not found.",
            "available_ids": list(ORDERS.keys()),
        }
    customer = CUSTOMERS.get(order["customer_id"], {})
    return {
        **order,
        "customer_name": customer.get("name", "Unknown"),
        "customer_tier": customer.get("tier", "standard"),
        "customer_email": customer.get("email"),
    }


@tool
def list_customer_orders(customer_name: str) -> list:
    """List all orders belonging to a customer (fuzzy name match).
    Returns a list of order objects with their current status."""
    results = []
    for cid, customer in CUSTOMERS.items():
        if customer_name.lower() in customer["name"].lower():
            for order in ORDERS.values():
                if order["customer_id"] == cid:
                    results.append({**order, "customer_name": customer["name"]})
    if not results:
        return [{"error": f"No customer or orders found for '{customer_name}'"}]
    return results


@tool
def check_refund_eligibility(order_id: str) -> dict:
    """Check whether an order qualifies for a refund and explain why.
    Always call this before process_refund."""
    order = ORDERS.get(order_id.upper())
    if not order:
        return {"eligible": False, "reason": f"Order '{order_id}' not found"}

    status = order["status"]
    if status == "delivered":
        return {
            "eligible": True,
            "order_id": order_id,
            "amount": order["amount"],
            "product": order["product"],
            "reason": "Delivered — qualifies for 30-day return window",
        }
    if status == "shipped":
        return {
            "eligible": True,
            "order_id": order_id,
            "amount": order["amount"],
            "product": order["product"],
            "reason": "In-transit — can be recalled and refunded",
        }
    if status == "refunded":
        return {"eligible": False, "reason": "Order has already been refunded"}
    return {
        "eligible": False,
        "order_id": order_id,
        "reason": f"Orders in '{status}' status cannot be refunded at this stage",
    }


@tool
def process_refund(order_id: str, reason: str) -> dict:
    """Issue a refund for an eligible order.
    ⚠️  Always call check_refund_eligibility before this tool."""
    order = ORDERS.get(order_id.upper())
    if not order:
        return {"success": False, "error": "Order not found"}
    if order["status"] == "refunded":
        return {"success": False, "error": "Order has already been refunded"}

    refund_id = f"REF-{len(REFUNDS) + 1:03d}"
    REFUNDS[refund_id] = {
        "id": refund_id,
        "order_id": order_id.upper(),
        "amount": order["amount"],
        "reason": reason,
        "status": "processed",
    }
    ORDERS[order_id.upper()]["status"] = "refunded"

    return {
        "success": True,
        "refund_id": refund_id,
        "amount": order["amount"],
        "product": order["product"],
        "message": f"Refund of ${order['amount']:.2f} processed successfully. Refund ID: {refund_id}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2.  SUPERVISOR ROUTING TOOLS  (descriptors only — never actually executed)
#     These exist so the supervisor LLM can signal intent.
#     The assign_tool edge intercepts the tool_call and routes via Send().
# ─────────────────────────────────────────────────────────────────────────────

@tool
def ask_order_agent(query: str) -> str:
    """Delegate to the order lookup specialist.
    Use for: order status, order details, customer order history, tracking info."""
    return query  # value never used — intercepted by assign_tool


@tool
def ask_refund_agent(query: str) -> str:
    """Delegate to the refund specialist.
    Use for: checking refund eligibility, processing refunds, refund status."""
    return query  # value never used — intercepted by assign_tool


@tool
def update_order_status(order_id: str, new_status: str, reason: str) -> str:
    """Directly update an order's status — admin action, requires human approval.
    Valid statuses: processing, shipped, delivered, cancelled, returned.
    Use for: cancellations, manual corrections, return processing."""
    return f"{order_id}:{new_status}:{reason}"  # intercepted by assign_tool


# ─────────────────────────────────────────────────────────────────────────────
# 3.  REACT SUBAGENTS  (self-contained tool-calling loops)
# ─────────────────────────────────────────────────────────────────────────────

_llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4.1-nano"),
    temperature=0,
    streaming=True,  # enables token-by-token streaming from the LLM
)

order_subagent = create_react_agent(
    model=_llm,
    tools=[get_order, list_customer_orders],
    name="order_agent",
    prompt=(
        "You are an order lookup specialist at a tech store's customer support. "
        "Use your tools to find accurate order information. "
        "Return a clear, concise summary that the supervisor can relay to the customer. "
        "Include order ID, product, status, amount, and any relevant details."
    ),
)

refund_subagent = create_react_agent(
    model=_llm,
    tools=[check_refund_eligibility, process_refund],
    name="refund_agent",
    prompt=(
        "You are a refund specialist at a tech store's customer support. "
        "Always check eligibility before processing a refund. "
        "Be clear about what happened: was the refund issued? What is the refund ID? "
        "Explain the outcome so the supervisor can relay it to the customer."
    ),
)


# ─────────────────────────────────────────────────────────────────────────────
# 4.  GRAPH STATE
# ─────────────────────────────────────────────────────────────────────────────

class State(MessagesState):
    # MessagesState already provides:
    #   messages: Annotated[list[BaseMessage], add_messages]
    # Add more fields here as your agent grows, e.g.:
    #   active_order_id: str
    pass


# ─────────────────────────────────────────────────────────────────────────────
# 5.  SUPERVISOR NODE  (the main LLM — decides what to do)
# ─────────────────────────────────────────────────────────────────────────────

SUPERVISOR_SYSTEM = """You are a helpful and professional customer support agent for a tech store.

You have three capabilities — use the right one based on the customer's request:

1. ask_order_agent   → for ANY question about orders: status, tracking, history, details
2. ask_refund_agent  → for refund eligibility checks OR to process a refund
3. update_order_status → admin action to change order status (needs human approval)
   - Only use this when explicitly asked to cancel, correct, or manually change an order

After a specialist responds, summarize their findings clearly and helpfully for the customer.
Be concise, friendly, and professional."""


def supervisor(state: State) -> dict:
    messages = [SystemMessage(content=SUPERVISOR_SYSTEM)] + state["messages"]
    llm_with_tools = _llm.bind_tools(
        [ask_order_agent, ask_refund_agent, update_order_status]
    )
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


# ─────────────────────────────────────────────────────────────────────────────
# 6.  ROUTING EDGE  (Send-based fan-out — mirrors the original assign_tool)
# ─────────────────────────────────────────────────────────────────────────────

def assign_tool(state: State):
    """
    Reads the supervisor's last message.
    If it has tool_calls → dispatch each one to the right node via Send.
    If no tool_calls → LLM is done, go to END.
    """
    last_message = state["messages"][-1]
    if not getattr(last_message, "tool_calls", None):
        return END

    sends = []
    for tool_call in last_message.tool_calls:
        match tool_call["name"]:
            case "ask_order_agent":
                sends.append(Send("order_agent", tool_call))
            case "ask_refund_agent":
                sends.append(Send("refund_agent", tool_call))
            case "update_order_status":
                sends.append(Send("update_order", tool_call))

    return sends if sends else END


# ─────────────────────────────────────────────────────────────────────────────
# 7.  TOOL NODES
# ─────────────────────────────────────────────────────────────────────────────

# ── 7a. Order agent node ────────────────────────────────────────────────────

async def order_agent(tool_call: dict) -> dict:
    """
    Receives the Send payload (the supervisor's tool_call dict).
    Emits a custom event so the UI can show a spinner, then
    invokes the ReAct subagent and returns a ToolMessage with the result.
    """
    writer = get_stream_writer()
    query = tool_call["args"].get("query", "")

    # Custom event → UI shows loading card immediately
    writer({
        "agent_status": {
            "agent": "order_agent",
            "status": f"Looking up orders: {query}",
        }
    })

    # Run the full ReAct loop inside the subagent
    result = await order_subagent.ainvoke({
        "messages": [HumanMessage(content=query)]
    })
    final_answer = result["messages"][-1].content

    return {
        "messages": [
            ToolMessage(
                content=final_answer,
                tool_call_id=tool_call["id"],
                name="ask_order_agent",
            )
        ]
    }


# ── 7b. Refund agent node ────────────────────────────────────────────────────

async def refund_agent(tool_call: dict) -> dict:
    """
    Invokes the refund ReAct subagent, emitting a custom event first.
    """
    writer = get_stream_writer()
    query = tool_call["args"].get("query", "")

    writer({
        "agent_status": {
            "agent": "refund_agent",
            "status": f"Processing refund request: {query}",
        }
    })

    result = await refund_subagent.ainvoke({
        "messages": [HumanMessage(content=query)]
    })
    final_answer = result["messages"][-1].content

    return {
        "messages": [
            ToolMessage(
                content=final_answer,
                tool_call_id=tool_call["id"],
                name="ask_refund_agent",
            )
        ]
    }


# ── 7c. Update order node (HITL) ─────────────────────────────────────────────

async def update_order(tool_call: dict) -> dict:
    """
    Write tool with Human-in-the-Loop:
    1. Validates the order exists
    2. Calls interrupt() — graph FREEZES, frontend shows approval card
    3. On resume:
       - "approve" → writes to DB
       - anything else → cancels
    4. Returns ToolMessage so supervisor can inform the customer
    """
    args = tool_call["args"]
    order_id = args.get("order_id", "").upper()
    new_status = args.get("new_status", "")
    reason = args.get("reason", "No reason provided")

    # Validate order exists before bothering the human
    order = ORDERS.get(order_id)
    if not order:
        return {
            "messages": [
                ToolMessage(
                    content=f"Cannot update: order '{order_id}' not found in the database.",
                    tool_call_id=tool_call["id"],
                    name="update_order_status",
                )
            ]
        }

    # ── HITL pause ──────────────────────────────────────────────────────────
    # The value dict is forwarded to the frontend as the interrupt payload.
    # The frontend shows an approve/cancel card with this info.
    approval = interrupt({
        "message": f"Approve status update for order {order_id}?",
        "order_id": order_id,
        "product": order["product"],
        "current_status": order["status"],
        "new_status": new_status,
        "reason": reason,
        "amount": order["amount"],
    })
    # ── RESUME POINT — code below only runs after the human responds ─────────

    if approval == "approve":
        old_status = order["status"]
        ORDERS[order_id]["status"] = new_status
        content = (
            f"✅ Order {order_id} ({order['product']}) updated: "
            f"'{old_status}' → '{new_status}'. Reason: {reason}"
        )
    else:
        content = (
            f"❌ Status update for order {order_id} was cancelled by the support agent."
        )

    return {
        "messages": [
            ToolMessage(
                content=content,
                tool_call_id=tool_call["id"],
                name="update_order_status",
            )
        ]
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8.  BUILD THE GRAPH
# ─────────────────────────────────────────────────────────────────────────────

checkpointer = InMemorySaver()


def build_graph():
    g = StateGraph(State)

    # Register nodes
    g.add_node("supervisor", supervisor)
    g.add_node("order_agent", order_agent)
    g.add_node("refund_agent", refund_agent)
    g.add_node("update_order", update_order)

    # Entry point
    g.add_edge(START, "supervisor")

    # Supervisor fans out to tool nodes (or ends)
    g.add_conditional_edges("supervisor", assign_tool)

    # All tool nodes report back to supervisor
    g.add_edge("order_agent", "supervisor")
    g.add_edge("refund_agent", "supervisor")
    g.add_edge("update_order", "supervisor")

    return g.compile(checkpointer=checkpointer)


graph = build_graph()