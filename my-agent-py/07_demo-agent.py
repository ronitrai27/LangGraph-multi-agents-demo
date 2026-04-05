# ============================================================
#  AI PROJECT MANAGER AGENT
# ============================================================
# Concepts covered:
#   ✅ ReAct agent — auto-selects tools via Reason + Act loop
#   ✅ 6 PM tools   — issues, tasks, tickets, sprints, members, summary
#   ✅ Short-term memory — MemorySaver keeps context across turns
#   ✅ Streaming   — see every tool call + result in real time
#   ✅ CLI REPL    — type questions, quit with 'exit'
# ============================================================

import json
from datetime import date
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain.agents import create_agent          # LangChain v1
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
 
load_dotenv()
 
# ────────────────────────────────────────────────────────────
# 🗃️  MOCK PROJECT DATABASE
# In a real app, these would be DB/API calls.
# ────────────────────────────────────────────────────────────
 
SPRINT = {
    "id": "SPR-4",
    "name": "Sprint 4 — Auth & Stability",
    "start": "2025-04-01",
    "end":   "2025-04-14",
    "goal":  "Ship OAuth login and fix critical API bugs",
    "velocity_target": 40,
    "velocity_actual": 27,          # <-- lagging!
    "days_remaining": 9,
    "status": "in_progress",
}
 
ISSUES = [
    {"id": "ISS-01", "title": "OAuth flow breaks on mobile Safari",     "status": "open",        "priority": "critical", "reporter": "alice",   "created": "2025-04-01"},
    {"id": "ISS-02", "title": "API rate-limit returns 500 not 429",     "status": "open",        "priority": "high",     "reporter": "bob",     "created": "2025-04-02"},
    {"id": "ISS-03", "title": "Dashboard charts flicker on dark mode",  "status": "not_started", "priority": "medium",   "reporter": "charlie", "created": "2025-04-03"},
    {"id": "ISS-04", "title": "CSV export truncates long descriptions",  "status": "not_started", "priority": "low",      "reporter": "alice",   "created": "2025-04-04"},
    {"id": "ISS-05", "title": "Login page 404 on prod deploy",          "status": "closed",      "priority": "critical", "reporter": "dave",    "created": "2025-03-28"},
]
 
TASKS = [
    {"id": "TSK-101", "title": "Implement Google OAuth",           "assignee": "alice",   "status": "in_progress",  "points": 8,  "sprint": "SPR-4"},
    {"id": "TSK-102", "title": "Write OAuth unit tests",           "assignee": "alice",   "status": "pending",       "points": 3,  "sprint": "SPR-4"},
    {"id": "TSK-103", "title": "Fix rate-limit response code",     "assignee": "bob",     "status": "in_progress",  "points": 5,  "sprint": "SPR-4"},
    {"id": "TSK-104", "title": "Add Redis caching layer",          "assignee": "bob",     "status": "not_started",  "points": 8,  "sprint": "SPR-4"},
    {"id": "TSK-105", "title": "Dark mode chart fix",              "assignee": "charlie", "status": "not_started",  "points": 3,  "sprint": "SPR-4"},
    {"id": "TSK-106", "title": "Refactor auth middleware",         "assignee": "charlie", "status": "completed",    "points": 5,  "sprint": "SPR-4"},
    {"id": "TSK-107", "title": "Update API docs for v2 endpoints", "assignee": "unassigned", "status": "not_started", "points": 5, "sprint": "SPR-4"},
    {"id": "TSK-108", "title": "Set up staging environment",       "assignee": "dave",    "status": "completed",    "points": 8,  "sprint": "SPR-4"},
    {"id": "TSK-109", "title": "Performance audit — dashboard",    "assignee": "dave",    "status": "pending",       "points": 5,  "sprint": "SPR-4"},
]
 
TICKETS = [
    {"id": "TKT-201", "title": "User can't reset password",         "priority": "high",   "status": "open",     "reported_by": "customer_1", "created": "2025-04-03"},
    {"id": "TKT-202", "title": "Billing invoice shows wrong date",  "priority": "medium", "status": "open",     "reported_by": "customer_2", "created": "2025-04-02"},
    {"id": "TKT-203", "title": "Slow load on 3G networks",          "priority": "low",    "status": "open",     "reported_by": "customer_3", "created": "2025-04-01"},
    {"id": "TKT-204", "title": "Dark mode not saving preference",   "priority": "medium", "status": "resolved", "reported_by": "customer_4", "created": "2025-03-30"},
    {"id": "TKT-205", "title": "Export button not visible on iOS",  "priority": "high",   "status": "open",     "reported_by": "customer_5", "created": "2025-04-04"},
]
 
MEMBERS = ["alice", "bob", "charlie", "dave"]

# ────────────────────────────────────────────────────────────
# 🔧 TOOLS  — what the agent can call
# Each docstring is the agent's only guide for WHEN to use it.
# ────────────────────────────────────────────────────────────
 
@tool
def get_issues(status: str = "all") -> str:
    """
    Get project issues filtered by status.
    status options: 'all' | 'open' | 'not_started' | 'closed'
    Use when asked about bugs, problems, blockers, or issues.
    """
    if status == "all":
        results = ISSUES
    else:
        results = [i for i in ISSUES if i["status"] == status]
    return json.dumps(results, indent=2)
 
 
@tool
def get_tasks(assignee: str = "all", status: str = "all") -> str:
    """
    Get sprint tasks, optionally filtered by assignee or status.
    assignee: team member name or 'all' | 'unassigned'
    status options: 'all' | 'pending' | 'in_progress' | 'not_started' | 'completed'
    Use when asked about work items, who is doing what, task progress.
    """
    results = TASKS
    if assignee != "all":
        results = [t for t in results if t["assignee"] == assignee]
    if status != "all":
        results = [t for t in results if t["status"] == status]
    return json.dumps(results, indent=2)
 
 
@tool
def get_tickets(status: str = "all", priority: str = "all") -> str:
    """
    Get customer support tickets.
    status options: 'all' | 'open' | 'resolved'
    priority options: 'all' | 'high' | 'medium' | 'low'
    Use when asked about customer complaints, support issues, or tickets.
    """
    results = TICKETS
    if status != "all":
        results = [t for t in results if t["status"] == status]
    if priority != "all":
        results = [t for t in results if t["priority"] == priority]
    return json.dumps(results, indent=2)
 
 
@tool
def get_sprint_status() -> str:
    """
    Get current sprint details: goal, dates, velocity, and progress.
    Use when asked about the current sprint, velocity, timeline, or deadlines.
    """
    completed_pts = sum(t["points"] for t in TASKS if t["status"] == "completed")
    total_pts = sum(t["points"] for t in TASKS)
    in_progress_pts = sum(t["points"] for t in TASKS if t["status"] == "in_progress")
 
    result = {
        **SPRINT,
        "points_completed": completed_pts,
        "points_in_progress": in_progress_pts,
        "points_total": total_pts,
        "points_remaining": total_pts - completed_pts,
        "completion_percent": round((completed_pts / total_pts) * 100, 1),
        "on_track": completed_pts >= (SPRINT["velocity_target"] * 0.5),  # rough midpoint check
        "today": str(date.today()),
    }
    return json.dumps(result, indent=2)
 
 
@tool
def get_member_workload(member: str = "all") -> str:
    """
    Get workload breakdown per team member — their tasks and statuses.
    member: a specific name ('alice', 'bob', 'charlie', 'dave') or 'all'
    Use when asked about who is busy, workload distribution, or a specific person's work.
    """
    names = MEMBERS if member == "all" else [member]
    workload = []
    for name in names:
        member_tasks = [t for t in TASKS if t["assignee"] == name]
        workload.append({
            "member": name,
            "total_tasks": len(member_tasks),
            "total_points": sum(t["points"] for t in member_tasks),
            "completed": sum(1 for t in member_tasks if t["status"] == "completed"),
            "in_progress": sum(1 for t in member_tasks if t["status"] == "in_progress"),
            "pending": sum(1 for t in member_tasks if t["status"] == "pending"),
            "not_started": sum(1 for t in member_tasks if t["status"] == "not_started"),
            "tasks": member_tasks,
        })
    return json.dumps(workload, indent=2)
 
 
@tool
def get_project_health() -> str:
    """
    Get a high-level project health report: what's lagging, blockers, risks, unassigned work.
    Use when asked for a summary, overview, health check, or 'how are we doing?'
    """
    completed_pts = sum(t["points"] for t in TASKS if t["status"] == "completed")
    total_pts = sum(t["points"] for t in TASKS)
    open_issues = [i for i in ISSUES if i["status"] in ("open", "not_started")]
    critical_issues = [i for i in ISSUES if i["priority"] == "critical" and i["status"] != "closed"]
    open_tickets = [t for t in TICKETS if t["status"] == "open"]
    high_tickets = [t for t in TICKETS if t["priority"] == "high" and t["status"] == "open"]
    unassigned = [t for t in TASKS if t["assignee"] == "unassigned"]
    lagging_members = []
    for name in MEMBERS:
        tasks = [t for t in TASKS if t["assignee"] == name]
        stuck = [t for t in tasks if t["status"] in ("not_started", "pending")]
        if len(stuck) > 1:
            lagging_members.append({"member": name, "stuck_tasks": len(stuck)})
 
    velocity_gap = SPRINT["velocity_target"] - SPRINT["velocity_actual"]
 
    report = {
        "sprint": SPRINT["name"],
        "days_remaining": SPRINT["days_remaining"],
        "completion_percent": round((completed_pts / total_pts) * 100, 1),
        "velocity_gap": velocity_gap,
        "velocity_status": "⚠️  BEHIND" if velocity_gap > 5 else "✅ ON TRACK",
        "open_issues_count": len(open_issues),
        "critical_unresolved": [i["title"] for i in critical_issues],
        "open_tickets_count": len(open_tickets),
        "high_priority_tickets": [t["title"] for t in high_tickets],
        "unassigned_tasks": [t["title"] for t in unassigned],
        "lagging_members": lagging_members,
        "risks": [
            f"Velocity is {velocity_gap} points behind target" if velocity_gap > 5 else None,
            f"{len(critical_issues)} critical issue(s) unresolved" if critical_issues else None,
            f"{len(unassigned)} task(s) unassigned" if unassigned else None,
            f"{len(high_tickets)} high-priority ticket(s) open" if high_tickets else None,
        ],
    }
    # Remove None risks
    report["risks"] = [r for r in report["risks"] if r]
    return json.dumps(report, indent=2)


# ────────────────────────────────────────────────────────────
# 🤖 AGENT SETUP
# ────────────────────────────────────────────────────────────
 
TOOLS = [
    get_issues,
    get_tasks,
    get_tickets,
    get_sprint_status,
    get_member_workload,
    get_project_health,
]
 

SYSTEM_PROMPT = """You are an AI Project Manager assistant for a software team.
You have real-time access to the project's issues, tasks, tickets, and sprint data.
 
Your job is to:
- Answer questions about project status, sprint progress, blockers, and team workload
- Identify what's lagging or at risk
- Highlight unresolved issues and open tickets
- Give actionable, concise answers — don't dump raw data, summarize it clearly
 
Always use the right tools to fetch live data before answering.
Today's date is {today}.
""".format(today=str(date.today()))
 
memory   = MemorySaver()
agent    = create_agent(
    "gpt-4.1-nano",         
    tools=TOOLS,
    checkpointer=memory,
    system_prompt=SYSTEM_PROMPT,
)

# ────────────────────────────────────────────────────────────
# 🎬 STREAMING RUNNER — shows every step in the terminal
# ────────────────────────────────────────────────────────────
 
DIVIDER = "─" * 62
 
def stream_and_display(user_input: str, config: dict) -> str:
    """
    Stream the agent's ReAct loop and print each step.
    Returns the final answer string.
    """
    print(f"\n{DIVIDER}")
    print(f"👤  You: {user_input}")
    print(DIVIDER)
 
    final_answer = ""
 
    # stream_mode="updates" gives us one dict per node execution.
    # Node names in LangChain v1 are "model" and "tools".
    # Older LangGraph used "agent" — we handle both for compatibility.
    for step in agent.stream(
        {"messages": [HumanMessage(user_input)]},
        config=config,
        stream_mode="updates",
    ):
        # ── Model node: thinking + tool calls ──────────────────
        agent_node = step.get("model") or step.get("agent")
        if agent_node:
            msg = agent_node["messages"][0]
 
            # If the model is calling tools, show which ones
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    args_display = json.dumps(tc["args"]) if tc["args"] else "(no args)"
                    print(f"\n  🔧  Calling → {tc['name']}({args_display})")
 
            # If the model wrote a plain text response (no tools), it's the final answer
            elif msg.content:
                final_answer = msg.content
 
        # ── Tools node: results coming back ────────────────────
        elif "tools" in step:
            for tm in step["tools"]["messages"]:
                # Parse JSON for a nicer preview
                try:
                    data = json.loads(tm.content)
                    if isinstance(data, list):
                        preview = f"{len(data)} item(s) returned"
                    elif isinstance(data, dict):
                        preview = ", ".join(f"{k}: {v}" for k, v in list(data.items())[:3])
                    else:
                        preview = str(data)[:120]
                except (json.JSONDecodeError, TypeError):
                    preview = str(tm.content)[:120]
                print(f"  ✅  [{tm.name}] → {preview}")
 
    print(f"\n{'─'*62}")
    print(f"🤖  Agent:\n{final_answer}")
    print(DIVIDER)
    return final_answer
 
 
# ────────────────────────────────────────────────────────────
# 💬 CLI REPL — command-line Q&A loop
# ────────────────────────────────────────────────────────────
 
def main():
    print("\n" + "═" * 62)
    print("  🤖  AI PROJECT MANAGER  —  Sprint 4 Agent")
    print("═" * 62)
    print("  Ask anything about your project, sprint, team, or tickets.")
    print("  The agent auto-picks the right tools and remembers context.")
    print("  Type 'exit' or 'quit' to stop.\n")
 
    # thread_id scopes the memory to this session.
    # Each unique thread_id = isolated conversation history.
    config = {"configurable": {"thread_id": "pm-session-1"}}
 
    sample_prompts = [
        "Give me a project health overview.",
        "What are the open critical issues?",
        "What is Alice working on?",
        "Which tasks are not started yet?",
        "How is the current sprint going?",
        "Are there any high-priority support tickets?",
        "Who has the most pending work?",
    ]
 
    print("  💡  Sample questions to try:")
    for i, p in enumerate(sample_prompts, 1):
        print(f"     {i}. {p}")
    print()
 
    while True:
        try:
            user_input = input("You ▸ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n👋  Bye!")
            break
 
        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            print("\n👋  Bye!")
            break
 
        stream_and_display(user_input, config)
 
 
if __name__ == "__main__":
    main()