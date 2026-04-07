/**
 * ============================================================
 *  SPRINT MANAGER — Multi-Agent System (TypeScript)
 * ============================================================
 *
 *  ARCHITECTURE
 *  ┌─────────────────────────────────────────────┐
 *  │              MAIN AGENT (ReAct)             │
 *  │   READ-ONLY tools:                          │
 *  │   • getTasks       • getIssues              │
 *  │   • getSprintInfo  • getTeammateDetails     │
 *  │   + 1 special tool:                         │
 *  │   • delegateToWriteAgent  ──────────────┐   │
 *  └─────────────────────────────────────────│───┘
 *                                            │
 *  ┌─────────────────────────────────────────▼───┐
 *  │            SUB-AGENT (ReAct + HITL)         │
 *  │   WRITE tools (all interrupt for approval): │
 *  │   • markTaskAsIssue  • getSprintDetails     │
 *  │   • assignTeammate   • addIssueComment      │
 *  └─────────────────────────────────────────────┘
 *
 *  FEATURES
 *  ✅ ReAct reasoning (think → act → observe loop)
 *  ✅ HITL interrupts on every write operation
 *  ✅ MemorySaver checkpointer (cross-turn memory)
 *  ✅ Streaming with console visualization
 *  ✅ Tool call logging with colors
 * ============================================================
 */


import "dotenv/config";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import {
  MemorySaver,
  interrupt,
  Command,
  START,
  END,
} from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import * as readline from "readline";

// ─── ANSI color helpers ───────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
  orange: "\x1b[38;5;214m",
};

function log(label: string, color: string, msg: string) {
  console.log(`${color}${C.bold}[${label}]${C.reset} ${msg}`);
}

function divider(title = "") {
  const line = "─".repeat(60);
  if (title) {
    console.log(`\n${C.gray}${line}${C.reset}`);
    console.log(`${C.bold}${C.white}  ${title}${C.reset}`);
    console.log(`${C.gray}${line}${C.reset}\n`);
  } else {
    console.log(`${C.gray}${line}${C.reset}`);
  }
}

// ─── FAKE DATABASE ────────────────────────────────────────────────────────────
const fakeDB = {
  project: {
    name: "Phoenix Platform",
    description:
      "A next-gen SaaS platform for enterprise workflow automation. Covers auth, payments, analytics, and real-time dashboards.",
    deadline: "2025-06-30",
    owner: "Alice Chen",
    status: "on-track",
    techStack: ["TypeScript", "React", "Node.js", "PostgreSQL", "Redis"],
    milestones: [
      { name: "Alpha Release", date: "2025-04-30", status: "upcoming" },
      { name: "Beta Release", date: "2025-05-31", status: "upcoming" },
      { name: "GA Launch", date: "2025-06-30", status: "upcoming" },
    ],
  },
  tasks: [
    {
      id: "T-101",
      title: "Fix login bug",
      status: "in-progress",
      assignee: "alice",
      sprintId: "SP-5",
      isIssue: false,
      priority: "high",
    },
    {
      id: "T-102",
      title: "Add dark mode",
      status: "todo",
      assignee: "bob",
      sprintId: "SP-5",
      isIssue: false,
      priority: "low",
    },
    {
      id: "T-103",
      title: "Payment gateway crash",
      status: "blocked",
      assignee: "charlie",
      sprintId: "SP-5",
      isIssue: false,
      priority: "critical",
    },
    {
      id: "T-104",
      title: "Optimize DB queries",
      status: "review",
      assignee: "alice",
      sprintId: "SP-5",
      isIssue: false,
      priority: "medium",
    },
    {
      id: "T-105",
      title: "Memory leak in dashboard",
      status: "todo",
      assignee: "unassigned",
      sprintId: "SP-5",
      isIssue: false,
      priority: "high",
    },
  ],
  sprints: [
    {
      id: "SP-5",
      name: "Sprint 5",
      startDate: "2025-04-01",
      endDate: "2025-04-14",
      status: "active",
      velocity: 32,
      goal: "Stabilize auth + payments, deliver dark mode",
    },
    {
      id: "SP-4",
      name: "Sprint 4",
      startDate: "2025-03-15",
      endDate: "2025-03-28",
      status: "completed",
      velocity: 28,
      goal: "API layer + DB optimizations",
    },
  ],
  teammates: [
    {
      id: "alice",
      name: "Alice Chen",
      role: "Senior Dev",
      email: "alice@phoenix.io",
      capacity: 80,
      tasksThisSprint: ["T-101", "T-104"],
      performance: "high",
    },
    {
      id: "bob",
      name: "Bob Patel",
      role: "Mid Dev",
      email: "bob@phoenix.io",
      capacity: 100,
      tasksThisSprint: ["T-102"],
      performance: "medium",
    },
    {
      id: "charlie",
      name: "Charlie Wu",
      role: "Junior Dev",
      email: "charlie@phoenix.io",
      capacity: 60,
      tasksThisSprint: ["T-103"],
      performance: "improving",
    },
    {
      id: "diana",
      name: "Diana Torres",
      role: "Senior Dev",
      email: "diana@phoenix.io",
      capacity: 100,
      tasksThisSprint: [],
      performance: "high",
    },
  ],
  issues: [] as { taskId: string; reason: string; raisedAt: string }[],
  reminders: [] as {
    to: string[];
    message: string;
    sentAt: string;
  }[],
};

// ═══════════════════════════════════════════════════════════════════════════════
//  READ TOOLS — Sub-Agent only, no HITL
// ═══════════════════════════════════════════════════════════════════════════════

const getTasks = tool(
  async ({ sprintId, assignee, status }) => {
    log(
      "READ:getTasks",
      C.cyan,
      `sprint=${sprintId ?? "any"} assignee=${assignee ?? "any"} status=${status ?? "any"}`,
    );
    let tasks = fakeDB.tasks;
    if (sprintId) tasks = tasks.filter((t) => t.sprintId === sprintId);
    if (assignee) tasks = tasks.filter((t) => t.assignee === assignee);
    if (status) tasks = tasks.filter((t) => t.status === status);
    return JSON.stringify(tasks, null, 2);
  },
  {
    name: "get_tasks",
    description:
      "Fetch tasks. Optionally filter by sprintId, assignee ID, or status (todo/in-progress/blocked/review/done).",
    // @ts-ignore
    schema: z.object({
      sprintId: z.string().optional(),
      assignee: z.string().optional(),
      status: z.string().optional(),
    }),
  },
);

const getIssues = tool(
  async () => {
    log("READ:getIssues", C.cyan, "Fetching all flagged issues");
    const flagged = fakeDB.tasks.filter((t) => t.isIssue);
    return JSON.stringify({ flaggedTasks: flagged, issueLog: fakeDB.issues }, null, 2);
  },
  {
    name: "get_issues",
    description: "Get all tasks currently flagged as issues and the issue log.",
    // @ts-ignore
    schema: z.object({}),
  },
);

const getSprintInfo = tool(
  async ({ sprintId }) => {
    log("READ:getSprintInfo", C.cyan, `sprintId=${sprintId ?? "active"}`);
    const sprint = sprintId
      ? fakeDB.sprints.find((s) => s.id === sprintId)
      : fakeDB.sprints.find((s) => s.status === "active");
    if (!sprint) return "Sprint not found";
    const sprintTasks = fakeDB.tasks.filter((t) => t.sprintId === sprint.id);
    const byStatus = sprintTasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return JSON.stringify({ sprint, taskCount: sprintTasks.length, byStatus, tasks: sprintTasks }, null, 2);
  },
  {
    name: "get_sprint_info",
    description: "Get sprint details. Omit sprintId to get the active sprint.",
    // @ts-ignore
    schema: z.object({
      sprintId: z.string().optional(),
    }),
  },
);

const getTeammateDetails = tool(
  async ({ teammateId }) => {
    log("READ:getTeammateDetails", C.cyan, `teammate=${teammateId ?? "all"}`);
    if (teammateId) {
      const tm = fakeDB.teammates.find((t) => t.id === teammateId);
      return tm ? JSON.stringify(tm, null, 2) : "Teammate not found";
    }
    return JSON.stringify(fakeDB.teammates, null, 2);
  },
  {
    name: "get_teammate_details",
    description:
      "Get teammate info: capacity, tasks, performance. Omit teammateId for all teammates.",
    // @ts-ignore
    schema: z.object({
      teammateId: z.string().optional(),
    }),
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
//  WRITE TOOLS — Main Agent only, all with HITL interrupt()
// ═══════════════════════════════════════════════════════════════════════════════

const markTaskAsIssue = tool(
  async ({ taskId, reason, priority }) => {
    log("WRITE:markTaskAsIssue", C.yellow, `⚡ Interrupt — flag ${taskId} as issue`);

    const approval = interrupt({
      action: "mark_task_as_issue",
      taskId,
      reason,
      priority,
      message: `🚨 Approve flagging task ${taskId} as a ${priority} issue?\n   Reason: ${reason}`,
    });

    if (!approval) return `❌ Rejected: Task ${taskId} was NOT flagged.`;

    const task = fakeDB.tasks.find((t) => t.id === taskId);
    if (!task) return `Task ${taskId} not found`;

    task.isIssue = true;
    fakeDB.issues.push({ taskId, reason, raisedAt: new Date().toISOString() });

    log("WRITE:markTaskAsIssue", C.green, `✅ Task ${taskId} flagged as ${priority} issue`);
    return `✅ Task ${taskId} ("${task.title}") flagged as a ${priority} issue.\n   Reason: ${reason}`;
  },
  {
    name: "mark_task_as_issue",
    description:
      "Flag a task as a blocker/issue with priority level. Requires human approval (HITL).",
    // @ts-ignore
    schema: z.object({
      taskId: z.string().describe("Task ID to flag e.g. T-103"),
      reason: z.string().describe("Why this task is an issue"),
      priority: z
        .enum(["low", "medium", "high", "critical"])
        .describe("Severity of the issue"),
    }),
  },
);

const assignTaskToTeammate = tool(
  async ({ taskId, teammateId, reason }) => {
    log(
      "WRITE:assignTask",
      C.yellow,
      `⚡ Interrupt — assign ${teammateId} → ${taskId}`,
    );

    const approval = interrupt({
      action: "assign_task_to_teammate",
      taskId,
      teammateId,
      reason,
      message: `👥 Approve assigning ${teammateId} to task ${taskId}?\n   Reason: ${reason}`,
    });

    if (!approval)
      return `❌ Rejected: Assignment of ${teammateId} to ${taskId} cancelled.`;

    const task = fakeDB.tasks.find((t) => t.id === taskId);
    const teammate = fakeDB.teammates.find((t) => t.id === teammateId);
    if (!task) return `Task ${taskId} not found`;
    if (!teammate) return `Teammate ${teammateId} not found`;

    const prev = task.assignee;
    task.assignee = teammateId;
    if (!teammate.tasksThisSprint.includes(taskId)) {
      teammate.tasksThisSprint.push(taskId);
    }

    log("WRITE:assignTask", C.green, `✅ ${teammate.name} assigned to ${taskId}`);
    return `✅ ${teammate.name} (${teammate.role}) assigned to "${task.title}".\n   Previous assignee: ${prev}\n   Reason: ${reason}`;
  },
  {
    name: "assign_task_to_teammate",
    description:
      "Reassign a task to a specific teammate. Requires human approval (HITL).",
    // @ts-ignore
    schema: z.object({
      taskId: z.string().describe("Task ID to reassign"),
      teammateId: z.string().describe("Teammate ID to assign to"),
      reason: z.string().describe("Why this person is the best fit"),
    }),
  },
);

const sendReminder = tool(
  async ({ recipients, message, urgency }) => {
    const recipientList =
      recipients === "all"
        ? fakeDB.teammates.map((t) => t.id)
        : [recipients];

    log(
      "WRITE:sendReminder",
      C.yellow,
      `⚡ Interrupt — send ${urgency} reminder to [${recipientList.join(", ")}]`,
    );

    const approval = interrupt({
      action: "send_reminder",
      recipients: recipientList,
      message,
      urgency,
      message_preview: `📣 Approve sending a ${urgency} reminder to [${recipientList.join(", ")}]?\n   Message: "${message}"`,
    });

    if (!approval) return `❌ Rejected: Reminder was NOT sent.`;

    const sentAt = new Date().toISOString();
    fakeDB.reminders.push({ to: recipientList, message, sentAt });

    // Fake console output simulating sending
    console.log(`\n${C.orange}${C.bold}  ╔══════════════════════════════════════╗${C.reset}`);
    console.log(`${C.orange}${C.bold}  ║         📬 REMINDER SENT              ║${C.reset}`);
    console.log(`${C.orange}${C.bold}  ╚══════════════════════════════════════╝${C.reset}`);
    recipientList.forEach((id) => {
      const tm = fakeDB.teammates.find((t) => t.id === id);
      if (tm) {
        console.log(
          `${C.orange}  → ${tm.name} <${tm.email}>${C.reset} ${C.gray}[${urgency.toUpperCase()}]${C.reset}`,
        );
      }
    });
    console.log(`${C.white}  "${message}"${C.reset}`);
    console.log(`${C.gray}  Sent at: ${sentAt}${C.reset}\n`);

    log("WRITE:sendReminder", C.green, `✅ Reminder sent to ${recipientList.length} teammate(s)`);
    return `✅ ${urgency.toUpperCase()} reminder sent to: ${recipientList.join(", ")}\n   Message: "${message}"`;
  },
  {
    name: "send_reminder",
    description:
      "Send a reminder to a specific teammate or all teammates. Requires human approval (HITL).",
    // @ts-ignore
    schema: z.object({
      recipients: z
        .string()
        .describe(
          "Teammate ID (e.g. 'alice') or 'all' to notify everyone",
        ),
      message: z.string().describe("The reminder message to send"),
      urgency: z
        .enum(["low", "normal", "high", "urgent"])
        .describe("Urgency level of the reminder"),
    }),
  },
);

// ─── PROJECT DETAILS TOOL — Main Agent, no HITL ──────────────────────────────

const getProjectDetails = tool(
  async () => {
    log("READ:getProjectDetails", C.blue, "Fetching project details");
    return JSON.stringify(fakeDB.project, null, 2);
  },
  {
    name: "get_project_details",
    description:
      "Get the project name, description, deadline, milestones, tech stack, and overall status.",
    // @ts-ignore
    schema: z.object({}),
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
//  READ-ONLY SUB-AGENT
//  Tools: get_tasks, get_issues, get_sprint_info, get_teammate_details
//  No HITL — runs clean and returns results
// ═══════════════════════════════════════════════════════════════════════════════

const model = new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 });
const checkpointer = new MemorySaver();

const readSubAgent = createReactAgent({
  llm: model,
  tools: [getTasks, getIssues, getSprintInfo, getTeammateDetails],
  checkpointSaver: checkpointer,
  messageModifier: `
You are the Read-Only Data Agent for a sprint management system called Phoenix Platform.
Your ONLY job is to gather and synthesize data — you never modify anything.

You have access to:
- get_tasks: fetch tasks with optional filters
- get_issues: see flagged issues
- get_sprint_info: sprint status, velocity, tasks breakdown
- get_teammate_details: capacity, assignments, performance

Respond with clear, structured summaries. Highlight:
- Blocked or critical tasks
- Overloaded teammates (high task count, low capacity)
- Unassigned tasks
- Any anomalies worth flagging to the manager

Be concise, factual, and data-driven.
`,
});

// ─── Wrap Sub-Agent as a tool for Main Agent ──────────────────────────────────

const delegateToReadAgent = tool(
  async ({ query, threadId }) => {
    log("DELEGATE→ReadAgent", C.magenta, `"${query}"`);
    divider("READ AGENT ACTIVATED");

    const config = { configurable: { thread_id: `read-${threadId}` } };

    const stream = readSubAgent.streamEvents(
      { messages: [{ role: "user", content: query }] },
      { ...config, version: "v2" },
    );

    let output = "";

    for await (const event of stream) {
      if (event.event === "on_tool_start") {
        log("ReadAgent→TOOL", C.cyan, `Calling: ${event.name}`);
        if (event.data?.input) {
          log("INPUT", C.gray, JSON.stringify(event.data.input));
        }
      }
      if (event.event === "on_tool_end") {
        log("ReadAgent←TOOL", C.cyan, `Done: ${event.name}`);
      }
      if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
        const content = event.data.chunk.content;
        if (typeof content === "string" && content) {
          process.stdout.write(`${C.magenta}${content}${C.reset}`);
          output += content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && block.text) {
              process.stdout.write(`${C.magenta}${block.text}${C.reset}`);
              output += block.text;
            }
          }
        }
      }
    }

    console.log();
    divider("READ AGENT DONE");

    // Return final message from sub-agent state
    const finalState = await readSubAgent.getState(config);
    const lastMsg = finalState.values?.messages?.at(-1);
    return lastMsg?.content ?? output ?? "Read agent completed with no output.";
  },
  {
    name: "delegate_to_read_agent",
    description: `
Delegate data gathering to the Read-Only Sub-Agent.
Use for: fetching sprint status, task lists, issue reports, teammate workloads, capacity analysis.
The sub-agent has no write capabilities — it only reads and summarizes.
Provide a clear natural language query describing what data you need.
`,
    // @ts-ignore
    schema: z.object({
      query: z.string().describe("Natural language query for the read agent"),
      threadId: z.string().describe("Current session thread ID"),
    }),
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN AGENT
//  Tools: delegate_to_read_agent, get_project_details (read)
//         mark_task_as_issue, assign_task_to_teammate, send_reminder (HITL write)
// ═══════════════════════════════════════════════════════════════════════════════

const mainAgent = createReactAgent({
  llm: model,
  tools: [
    // Read delegation
    delegateToReadAgent,
    // Direct read (no sub-agent needed for simple project info)
    getProjectDetails,
    // HITL write tools — interrupt() lives HERE in the main agent graph ✅
    markTaskAsIssue,
    assignTaskToTeammate,
    sendReminder,
  ],
  checkpointSaver: checkpointer,
  messageModifier: `
You are the Sprint Manager Agent for the Phoenix Platform project — a senior engineering manager assistant.

ARCHITECTURE:
- You have a Read-Only Sub-Agent (delegate_to_read_agent) for all data gathering
- You handle write operations DIRECTLY with HITL approval: mark issues, assign tasks, send reminders
- You can fetch project details yourself via get_project_details

YOUR WORKFLOW:
1. GATHER DATA — use delegate_to_read_agent to get sprint, tasks, teammates, issues
2. ANALYZE — identify blockers, overloaded devs, unassigned tasks, at-risk milestones
3. DECIDE — reason step by step about what actions need to be taken
4. ACT — call write tools directly (they will pause for human approval automatically)

WRITE TOOLS (require approval):
- mark_task_as_issue: flag a task as a blocker with priority
- assign_task_to_teammate: reassign a task to the best-fit teammate
- send_reminder: notify one or all teammates about something important

GUIDELINES:
- Always justify your decisions with data before acting
- When assigning, explain WHY this person is the best fit (capacity, skill, performance)
- When flagging an issue, specify priority clearly
- Reminders should be specific, actionable, and appropriately urgent
- If the human says "yes", "confirm", "approve", or similar → they are approving a pending action
`,
});

// ═══════════════════════════════════════════════════════════════════════════════
//  HITL APPROVAL HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

async function handleInterrupt(interruptData: any[]): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  divider("⏸  HUMAN APPROVAL REQUIRED");

  let approved = true;

  for (const item of interruptData) {
    const displayMsg = item.message_preview ?? item.message ?? JSON.stringify(item);
    console.log(`\n${C.yellow}${C.bold}ACTION:${C.reset} ${item.action ?? "unknown"}`);
    console.log(`${C.white}${displayMsg}${C.reset}\n`);

    const answer = await ask(`${C.bold}Approve? (y/n): ${C.reset}`);
    approved = answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
    log("HITL", approved ? C.green : C.red, approved ? "✅ Approved" : "❌ Rejected");
  }

  rl.close();
  return approved;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN AGENT RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

async function runMainAgent(userMessage: string, threadId: string) {
  divider(`🧠 MAIN AGENT — Thread: ${threadId}`);
  log("USER", C.blue, userMessage);
  console.log();

  const config = { configurable: { thread_id: threadId } };

  const stream = mainAgent.streamEvents(
    { messages: [new HumanMessage(userMessage)] },
    { ...config, version: "v2" },
  );

  let tokensBuffer = "";

  for await (const event of stream) {
    if (event.event === "on_tool_start") {
      if (tokensBuffer) { console.log(); tokensBuffer = ""; }
      divider();
      log("MAIN→TOOL", C.cyan, `🔧 ${event.name}`);
      if (event.data?.input) {
        log("INPUT", C.gray, JSON.stringify(event.data.input));
      }
    }
    if (event.event === "on_tool_end") {
      log("TOOL→MAIN", C.green, `✅ ${event.name} returned`);
    }
    if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
      const content = event.data.chunk.content;
      if (typeof content === "string" && content) {
        process.stdout.write(`${C.white}${content}${C.reset}`);
        tokensBuffer += content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text" && block.text) {
            process.stdout.write(`${C.white}${block.text}${C.reset}`);
            tokensBuffer += block.text;
          }
        }
      }
    }
  }

  if (tokensBuffer) console.log();

  // ── Check for pending HITL interrupts in main agent ────────────────────────
  const state = await mainAgent.getState(config);
  const pendingInterrupts = state?.tasks
    ?.flatMap((t: any) => t.interrupts ?? [])
    ?.map((i: any) => i.value);

  if (pendingInterrupts && pendingInterrupts.length > 0) {
    const approved = await handleInterrupt(pendingInterrupts);

    divider("▶  RESUMING AFTER APPROVAL");

    const resumeStream = mainAgent.streamEvents(
      new Command({ resume: approved }),
      { ...config, version: "v2" },
    );

    let resumeBuffer = "";
    for await (const event of resumeStream) {
      if (event.event === "on_tool_start") {
        if (resumeBuffer) { console.log(); resumeBuffer = ""; }
        log("MAIN→TOOL", C.cyan, `🔧 ${event.name}`);
      }
      if (event.event === "on_tool_end") {
        log("TOOL→MAIN", C.green, `✅ ${event.name}`);
      }
      if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
        const content = event.data.chunk.content;
        if (typeof content === "string" && content) {
          process.stdout.write(`${C.white}${content}${C.reset}`);
          resumeBuffer += content;
        } else if (Array.isArray(content)) {
          for (const b of content) {
            if (b?.type === "text" && b.text) {
              process.stdout.write(`${C.white}${b.text}${C.reset}`);
              resumeBuffer += b.text;
            }
          }
        }
      }
    }
    if (resumeBuffer) console.log();

    // Check if there are MORE interrupts (multiple write actions in one turn)
    const stateAfter = await mainAgent.getState(config);
    const moreInterrupts = stateAfter?.tasks
      ?.flatMap((t: any) => t.interrupts ?? [])
      ?.map((i: any) => i.value);

    if (moreInterrupts && moreInterrupts.length > 0) {
      // Recursively handle additional interrupts
      const moreApproved = await handleInterrupt(moreInterrupts);
      divider("▶  RESUMING NEXT ACTION");

      const nextStream = mainAgent.streamEvents(
        new Command({ resume: moreApproved }),
        { ...config, version: "v2" },
      );
      for await (const event of nextStream) {
        if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
          const content = event.data.chunk.content;
          if (typeof content === "string" && content)
            process.stdout.write(`${C.white}${content}${C.reset}`);
          else if (Array.isArray(content))
            for (const b of content)
              if (b?.type === "text" && b.text)
                process.stdout.write(`${C.white}${b.text}${C.reset}`);
        }
        if (event.event === "on_tool_end") log("TOOL→MAIN", C.green, `✅ ${event.name}`);
      }
      console.log();
    }
  }

  divider("✅ TURN COMPLETE");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MULTI-TURN CONSOLE LOOP
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.clear();
  divider("🚀 PHOENIX PLATFORM — SPRINT MANAGER (Multi-Agent)");

  console.log(`${C.gray}
  ARCHITECTURE:
  ┌─────────────────────────────────────────────┐
  │              MAIN AGENT                     │
  │  Tools:                                     │
  │  • delegate_to_read_agent  (sub-agent)      │
  │  • get_project_details                      │
  │  • mark_task_as_issue      [HITL ⏸]         │
  │  • assign_task_to_teammate [HITL ⏸]         │
  │  • send_reminder           [HITL ⏸]         │
  └──────────────┬──────────────────────────────┘
                 │ delegates to
  ┌──────────────▼──────────────────────────────┐
  │           READ-ONLY SUB-AGENT               │
  │  Tools:                                     │
  │  • get_tasks                                │
  │  • get_issues                               │
  │  • get_sprint_info                          │
  │  • get_teammate_details                     │
  └─────────────────────────────────────────────┘

  Commands: 'quit' to exit
${C.reset}`);

  const demoQueries = [
    "Give me a full sprint overview — tasks, issues, and team workload.",
    "Check the project details and tell me if we're at risk of missing any milestones.",
    "Flag the payment gateway task as a critical issue and assign the memory leak to the best available dev.",
    "Send an urgent reminder to all teammates about the Sprint 5 deadline.",
    "Who has the most capacity right now? Assign them the unassigned task.",
  ];

  console.log(`${C.gray}💡 Example queries:${C.reset}`);
  demoQueries.forEach((q, i) =>
    console.log(`  ${C.gray}${i + 1}. ${q}${C.reset}`),
  );
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  const threadId = `session-${Date.now()}`;
  log("SESSION", C.gray, `Thread ID: ${threadId}`);

  while (true) {
    const input = await ask(`\n${C.bold}${C.blue}You: ${C.reset}`);

    if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
      console.log(`\n${C.gray}Goodbye! 👋${C.reset}`);
      rl.close();
      break;
    }

    if (!input.trim()) continue;

    try {
      await runMainAgent(input, threadId);
    } catch (err: any) {
      log("ERROR", C.red, err.message ?? String(err));
      console.error(err);
    }
  }
}

main().catch(console.error);