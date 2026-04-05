# ============================================================
# LESSON 4: TOOLS
# Give the model the ability to DO things, not just say things.
# A tool = a Python function + a description the LLM reads.
# ============================================================

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from datetime import datetime
import json

load_dotenv()
model = init_chat_model("gpt-4.1-nano", temperature=0)

# --------------------
# ── 1. Define a tool with @tool decorator ────────────────────
# The docstring IS the description the LLM reads.
# The type hints ARE the schema the LLM uses.
# Write them carefully — this is how the model knows what to call.

@tool
def get_project_status(project_id: str) -> dict:
    """
    Get the current status of a project by its ID.
    Returns sprint progress, open tickets, and blockers.
    """
    # In production: query your DB here
    fake_db = {
        "proj-001": {
            "name": "TaskFlow v2",
            "sprint": "Sprint 12",
            "open_tickets": 8,
            "completed": 14,
            "blockers": ["API rate limits on Slack integration"],
            "health": "at-risk"
        },
        "proj-002": {
            "name": "Mobile App",
            "sprint": "Sprint 5",
            "open_tickets": 3,
            "completed": 19,
            "blockers": [],
            "health": "on-track"
        }
    }
    return fake_db.get(project_id, {"error": "Project not found"})

@tool
def create_ticket(
    title: str,
    description: str,
    priority: str,
    assignee: str = "unassigned"
) -> dict:
    """
    Create a new ticket in the project management system.
    Priority must be: low, medium, high, or critical.
    Returns the created ticket with its ID.
    """
    ticket_id = f"TICK-{hash(title) % 9000 + 1000}"
    return {
        "id": ticket_id,
        "title": title,
        "description": description,
        "priority": priority,
        "assignee": assignee,
        "created_at": datetime.now().isoformat(),
        "status": "open"
    }

@tool
def get_team_availability(week: str) -> dict:
    """
    Get team member availability for a given week.
    Week format: YYYY-WXX (e.g., 2024-W15)
    Returns available days per team member.
    """
    return {
        "week": week,
        "team": {
            "alice": {"available_days": 5, "on_leave": False},
            "bob": {"available_days": 3, "on_leave": False, "note": "conf Tue-Wed"},
            "charlie": {"available_days": 0, "on_leave": True},
        }
    }
    
# ── 2. Inspect what the LLM actually sees ────────────────────
# print("Tool name:", get_project_status.name)
# print("Tool description:", get_project_status.description)
# print("Tool schema:", json.dumps(get_project_status.args_schema.model_json_schema(), indent=2))

# ── 3. bind_tools() → give the model access to tools ─────────
# The model doesn't RUN tools. It DECIDES which to call.
# You execute them. (Agents do this automatically.)

tools = [get_project_status, create_ticket, get_team_availability]
model_with_tools = model.bind_tools(tools)

# ── 4. Model decides which tool to call ──────────────────────
# response = model_with_tools.invoke("What's the status of project proj-001?")
# print("\nAI response type:", type(response))
# print("Tool calls:", response.tool_calls)
# [{'name': 'get_project_status', 'args': {'project_id': 'proj-001'}, 'id': '...'}]


# --------------------------
# ── 5. Parallel tool calls ────────────────────────────────────
# Model calls multiple tools in one go when needed
response = model_with_tools.invoke(
    "Compare the status of proj-001 and proj-002"
)
print("\nParallel tool calls:")
for tc in response.tool_calls:
    print(f"  → {tc['name']}({tc['args']})")