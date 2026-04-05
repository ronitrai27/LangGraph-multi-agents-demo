# ============================================================
# LESSON 5: AGENTS
# The LLM is now in the driver's seat.
# It picks tools, reads results, picks more tools, until done.
# ============================================================

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
# from langchain import create_react_agent  # ReAct = Reason + Act
from langchain_core.messages import HumanMessage

from langgraph.prebuilt import create_react_agent   # ← was here before v1

load_dotenv()

# ── Define tools ─────────────────────────────────────────────
@tool
def get_tickets(project: str, status: str = "open") -> list[dict]:
    """Get tickets for a project. Status: open | closed | blocked."""
    return [
        {"id": "T-101", "title": "Fix auth bug", "status": "blocked", "assignee": "alice"},
        {"id": "T-102", "title": "Add dark mode", "status": "open", "assignee": "bob"},
        {"id": "T-103", "title": "Write API docs", "status": "open", "assignee": "unassigned"},
    ]

@tool
def get_velocity(team: str, sprints: int = 3) -> dict:
    """Get average team velocity for last N sprints."""
    return {"team": team, "avg_velocity": 34, "trend": "stable", "last_sprints": [30, 36, 35]}

@tool
def suggest_sprint_goal(tickets: str) -> str:
    """
    Given a comma-separated list of ticket IDs,
    suggest a sprint goal that ties them together.
    """
    return "Improve platform stability and developer experience"

@tool
def assign_ticket(ticket_id: str, assignee: str) -> dict:
    """Assign a ticket to a team member."""
    return {"ticket_id": ticket_id, "assignee": assignee, "status": "assigned"}

tools = [get_tickets, get_velocity, suggest_sprint_goal, assign_ticket]

# ── Create the agent ─────────────────────────────────────────
# create_react_agent builds the ReAct loop:
# Thought → Action (tool call) → Observation (result) → repeat

model = init_chat_model("gpt-4.1-nano", temperature=0)
agent = create_react_agent(model, tools)

# ── Run the agent ─────────────────────────────────────────────
# You give it a goal. It figures out what to call and when.

# response = agent.invoke({
#     "messages": [
#         HumanMessage("What are the open tickets for project alpha? Also check team velocity and suggest a sprint goal for the unassigned ones.")
#     ]
# })

# The response contains all messages in the conversation
# for msg in response["messages"]:
#     print(f"[{msg.__class__.__name__}]: {str(msg.content)[:200]}")
#     print()
    
    
# --------------------------------
# ── Stream agent steps in real-time ──────────────────────────
print("\n=== STREAMING AGENT STEPS ===\n")

for step in agent.stream({
    "messages": [HumanMessage("Assign the API docs ticket T-103 to charlie and confirm.")]
}):
    # Each step is either an agent thought or a tool result
    if "agent" in step:
        content = step["agent"]["messages"][0].content
        if content:
            print(f"🤔 Agent: {content[:200]}")
        tool_calls = step["agent"]["messages"][0].tool_calls
        if tool_calls:
            for tc in tool_calls:
                print(f"🔧 Calling: {tc['name']}({tc['args']})")
    elif "tools" in step:
        for tm in step["tools"]["messages"]:
            print(f"✅ Tool result: {tm.content[:200]}")
    print()

# ── System prompt → give the agent a persona ─────────────────
from langchain_core.messages import SystemMessage

response = agent.invoke({
    "messages": [
        SystemMessage("""You are a PM assistant for a SaaS startup.
Always be concise. When checking project status, also look at velocity.
Recommend actions, don't just report data."""),
        HumanMessage("Give me a quick sprint health check for project alpha."),
    ]
})
print("\n=== PM ASSISTANT RESPONSE ===")
last_msg = response["messages"][-1]
print(last_msg.content)

# It's a loop: LLM reasons → picks tool → tool runs →
# result back to LLM → reasons again → until it has the answer.
# You just define tools. LangChain runs the loop.