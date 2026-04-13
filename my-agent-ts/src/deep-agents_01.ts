import "dotenv/config";
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { MemorySaver, Command } from "@langchain/langgraph";
import { z } from "zod";
import * as readline from "readline";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSOLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[97m",
  dim: "\x1b[2m",
};
const log = (tag: string, color: string, msg: string) =>
  console.log(`${color}${C.bold}[${tag}]${C.reset} ${color}${msg}${C.reset}`);
const divider = (label = "") =>
  console.log(
    `\n${C.gray}${"─".repeat(20)} ${label} ${"─".repeat(20)}${C.reset}\n`,
  );

// ─────────────────────────────────────────────────────────────────────────────
//  FIX 1 — Tool event logger
//  Only logs: which subagent called, which tool, success, error.
//  Does NOT print tool output/data.
// ─────────────────────────────────────────────────────────────────────────────

function logToolStart(
  toolName: string,
  source: "main" | "subagent",
  subagentName?: string,
) {
  const who =
    source === "subagent"
      ? `${C.cyan}[${subagentName ?? "subagent"}]${C.reset}`
      : `${C.blue}[ROXO]${C.reset}`;
  console.log(
    `  ${who} ${C.dim}→ calling${C.reset} ${C.yellow}${C.bold}${toolName}${C.reset}`,
  );
}

function logToolSuccess(
  toolName: string,
  source: "main" | "subagent",
  subagentName?: string,
) {
  const who =
    source === "subagent"
      ? `${C.cyan}[${subagentName ?? "subagent"}]${C.reset}`
      : `${C.blue}[ROXO]${C.reset}`;
  console.log(`  ${who} ${C.green}✓ ${toolName} succeeded${C.reset}`);
}

function logToolError(
  toolName: string,
  err: string,
  source: "main" | "subagent",
  subagentName?: string,
) {
  const who =
    source === "subagent"
      ? `${C.cyan}[${subagentName ?? "subagent"}]${C.reset}`
      : `${C.blue}[ROXO]${C.reset}`;
  console.log(`  ${who} ${C.red}✗ ${toolName} failed: ${err}${C.reset}`);
}

function logSubagentCalled(name: string) {
  console.log(`\n${C.cyan}${C.bold}  ◆ Subagent called: ${name}${C.reset}`);
}

function logSubagentDone(name: string) {
  console.log(`${C.cyan}  ◇ Subagent done:   ${name}${C.reset}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAKE DATABASE
// ─────────────────────────────────────────────────────────────────────────────

const fakeDB = {
  project: {
    name: "WEkraft",
    description: "AI-powered project management platform",
    deadline: "2025-09-01",
    status: "on-track",
    milestones: [
      { name: "MVP Launch", date: "2025-06-15", done: false },
      { name: "Beta Release", date: "2025-07-30", done: false },
    ],
    velocity: { lastSprint: 34, avgSprint: 30, trend: "improving" },
  },
  sprints: [
    {
      id: "SP-5",
      name: "Sprint 5",
      status: "active",
      startDate: "2025-04-07",
      endDate: "2025-04-21",
      goal: "Ship ROXO agent v1 + dashboard redesign",
      storyPoints: { total: 42, completed: 18, remaining: 24 },
    },
    {
      id: "SP-4",
      name: "Sprint 4",
      status: "completed",
      startDate: "2025-03-24",
      endDate: "2025-04-06",
      storyPoints: { total: 38, completed: 34, remaining: 0 },
    },
  ],
  tasks: [
    {
      id: "T-201",
      title: "Build ROXO main agent",
      status: "in-progress",
      assignee: "ali",
      sprintId: "SP-5",
      points: 8,
    },
    {
      id: "T-202",
      title: "Dashboard redesign",
      status: "todo",
      assignee: "sara",
      sprintId: "SP-5",
      points: 5,
    },
    {
      id: "T-203",
      title: "Fix auth bug",
      status: "blocked",
      assignee: null,
      sprintId: "SP-5",
      points: 3,
    },
    {
      id: "T-204",
      title: "Write API docs",
      status: "todo",
      assignee: null,
      sprintId: null,
      points: 2,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 1 TOOLS — Project Basics
//  Tools log their own start/success/error — no data printed
// ─────────────────────────────────────────────────────────────────────────────

const getTasks = tool(
  async ({ sprintId, status }: { sprintId?: string; status?: string }) => {
    logToolStart("get_tasks", "subagent", "project-basics-intel");
    try {
      let tasks = fakeDB.tasks;
      if (sprintId) tasks = tasks.filter((t) => t.sprintId === sprintId);
      if (status) tasks = tasks.filter((t) => t.status === status);
      logToolSuccess("get_tasks", "subagent", "project-basics-intel");
      return JSON.stringify(tasks, null, 2);
    } catch (e: any) {
      logToolError("get_tasks", e.message, "subagent", "project-basics-intel");
      throw e;
    }
  },
  {
    name: "get_tasks",
    description: "Fetch tasks. Optionally filter by sprintId or status.",
    schema: z.object({
      sprintId: z.string().optional(),
      status: z.string().optional(),
    }),
  },
);

const getSprints = tool(
  async () => {
    logToolStart("get_sprints", "subagent", "project-basics-intel");
    try {
      logToolSuccess("get_sprints", "subagent", "project-basics-intel");
      return JSON.stringify(fakeDB.sprints, null, 2);
    } catch (e: any) {
      logToolError(
        "get_sprints",
        e.message,
        "subagent",
        "project-basics-intel",
      );
      throw e;
    }
  },
  {
    name: "get_sprints",
    description: "Fetch all sprints.",
    schema: z.object({}),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 2 TOOLS — Insights
// ─────────────────────────────────────────────────────────────────────────────

const getProjectDetails = tool(
  async () => {
    logToolStart("get_project_details", "subagent", "insights-intel");
    try {
      const { name, description, status, milestones } = fakeDB.project;
      logToolSuccess("get_project_details", "subagent", "insights-intel");
      return JSON.stringify({ name, description, status, milestones }, null, 2);
    } catch (e: any) {
      logToolError(
        "get_project_details",
        e.message,
        "subagent",
        "insights-intel",
      );
      throw e;
    }
  },
  {
    name: "get_project_details",
    description: "Get project name, description, status and milestones.",
    schema: z.object({}),
  },
);

const getDeadlineVelocity = tool(
  async () => {
    logToolStart("get_deadline_velocity", "subagent", "insights-intel");
    try {
      const { deadline, velocity } = fakeDB.project;
      logToolSuccess("get_deadline_velocity", "subagent", "insights-intel");
      return JSON.stringify({ deadline, velocity }, null, 2);
    } catch (e: any) {
      logToolError(
        "get_deadline_velocity",
        e.message,
        "subagent",
        "insights-intel",
      );
      throw e;
    }
  },
  {
    name: "get_deadline_velocity",
    description: "Get project deadline and sprint velocity trend.",
    schema: z.object({}),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  WRITE TOOL — Add Task to Sprint (main agent, HITL via interruptOn)
// ─────────────────────────────────────────────────────────────────────────────

const addTaskToSprint = tool(
  async ({
    taskId,
    sprintId,
    reason,
  }: {
    taskId: string;
    sprintId: string;
    reason: string;
  }) => {
    logToolStart("add_task_to_sprint", "main");
    try {
      const task = fakeDB.tasks.find((t) => t.id === taskId);
      if (!task) {
        logToolError("add_task_to_sprint", `Task ${taskId} not found`, "main");
        return `Task ${taskId} not found.`;
      }
      task.sprintId = sprintId;
      logToolSuccess("add_task_to_sprint", "main");
      return `✅ Task "${task.title}" (${taskId}) added to sprint ${sprintId}.\nReason: ${reason}`;
    } catch (e: any) {
      logToolError("add_task_to_sprint", e.message, "main");
      throw e;
    }
  },
  {
    name: "add_task_to_sprint",
    description: "Add an existing task to a sprint. Requires human approval.",
    schema: z.object({
      taskId: z.string().describe("Task ID e.g. T-204"),
      sprintId: z.string().describe("Sprint ID e.g. SP-5"),
      reason: z.string().describe("Why this task belongs in this sprint"),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  ROXO — createDeepAgent (logic unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const roxo = createDeepAgent({
  model: "openai:gpt-4.1-nano",
  tools: [addTaskToSprint],
  checkpointer,
  systemPrompt: `You are ROXO, the AI PM agent for WEkraft.

SUBAGENTS AVAILABLE (use the task() tool to call them):
- project-basics-intel: get tasks and sprint data
- insights-intel: get project health, deadlines, velocity

WORKFLOW:
1. Gather data first — delegate to subagents via task()
2. Analyze what you found
3. Use add_task_to_sprint when action is needed (requires approval)

Be concise and data-driven. Always justify write actions with data.`,

  subagents: [
    {
      name: "project-basics-intel",
      description:
        "Get tasks, sprints, blocked items, unassigned tasks. Use for sprint overview and task status.",
      systemPrompt: `You are the Project Basics Intel subagent for WEkraft.
Gather and summarize task and sprint data. Never modify anything.
Highlight: blocked tasks, unassigned tasks, sprint progress.
Return a concise summary — do NOT include raw JSON.`,
      tools: [getTasks, getSprints],
    },
    {
      name: "insights-intel",
      description:
        "Get project health, deadlines, velocity trends. Use for risk assessment and milestone analysis.",
      systemPrompt: `You are the Insights Intel subagent for WEkraft.
Analyze project health — deadlines, milestones, velocity trends.
Never modify anything. Give actionable insights. Flag risks clearly.
Return a concise summary under 200 words.`,
      tools: [getProjectDetails, getDeadlineVelocity],
    },
  ],

  interruptOn: {
    add_task_to_sprint: true,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  STREAMING — same logic, adds subagent lifecycle logs
// ─────────────────────────────────────────────────────────────────────────────

async function streamRoxo(
  input: Parameters<typeof roxo.stream>[0],
  config: Parameters<typeof roxo.stream>[1],
) {
  const stream = await roxo.stream(input, {
    ...config,
    streamMode: ["messages", "updates"],
    subgraphs: true,
  } as any);

  let lastSource = "";
  // Track active subagents by their namespace key so we can log start/done once
  const activeSubagents = new Set<string>();

  for await (const [namespace, mode, data] of stream as any) {
    const ns = namespace as string[];
    const isSubagent = ns.some((s: string) => s.startsWith("tools:"));
    const source = isSubagent ? "subagent" : "main";
    // The namespace segment "tools:callId" is the subagent's unique key
    const subagentKey = ns.find((s: string) => s.startsWith("tools:")) ?? "";

    // ── FIX 1: Subagent lifecycle logging ────────────────────────────────────
    if (mode === "updates") {
      if (isSubagent && subagentKey && !activeSubagents.has(subagentKey)) {
        // First update from this subagent namespace = it just started
        activeSubagents.add(subagentKey);
        // Extract name from tool result if available, else use key
        // We log generically; tool-level logs inside the tools are more precise
        logSubagentCalled(subagentKey.replace("tools:", "call-"));
      }

      if (!isSubagent) {
        // Main agent's "tools" node = subagent returned its result
        const toolMsgs = (data as any)?.tools?.messages ?? [];
        for (const msg of toolMsgs) {
          if (msg.type === "tool" && msg.name === "task") {
            // The task tool wraps subagent calls — log completion
            logSubagentDone(msg.name);
          }
        }
      }
    }

    // ── Token streaming (unchanged) ───────────────────────────────────────────
    if (mode === "messages") {
      const [message] = data as any[];
      if (message?.text) {
        if (source !== lastSource) {
          if (lastSource) console.log();
          process.stdout.write(
            isSubagent
              ? `\n${C.cyan}[subagent] ${C.reset}`
              : `\n${C.white}[ROXO] ${C.reset}`,
          );
          lastSource = source;
        }
        process.stdout.write(
          isSubagent
            ? `${C.cyan}${message.text}${C.reset}`
            : `${C.white}${message.text}${C.reset}`,
        );
      }
    }
  }

  if (lastSource) console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
//  FIX 2 — HITL UI: proper prompt box, shows action + args, y/n input
// ─────────────────────────────────────────────────────────────────────────────

async function handleInterrupt(
  interruptPayloads: any[],
): Promise<"approve" | "reject"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  console.log(
    `\n${C.yellow}${C.bold}╔══════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.yellow}${C.bold}║        ⏸  APPROVAL REQUIRED                  ║${C.reset}`,
  );
  console.log(
    `${C.yellow}${C.bold}╚══════════════════════════════════════════════╝${C.reset}\n`,
  );

  for (const item of interruptPayloads) {
    const actionRequests = item.actionRequests ?? item.action_requests ?? [];

    for (const action of actionRequests) {
      // Show the action name
      console.log(
        `  ${C.white}${C.bold}Action:${C.reset}  ${C.yellow}${action.name}${C.reset}`,
      );

      // Show each arg on its own line — clean, no raw JSON blob
      const args = action.args ?? action.arguments ?? {};
      console.log(`  ${C.white}${C.bold}Details:${C.reset}`);
      for (const [key, val] of Object.entries(args)) {
        console.log(
          `    ${C.gray}${key}:${C.reset} ${C.white}${val}${C.reset}`,
        );
      }

      console.log();
      console.log(`  ${C.dim}Type  y  to approve,  n  to reject${C.reset}`);
      console.log();

      // Keep asking until valid input
      let answer = "";
      while (!["y", "yes", "n", "no"].includes(answer.toLowerCase().trim())) {
        answer = await ask(
          `  ${C.bold}${C.yellow}Your decision (y/n): ${C.reset}`,
        );
        if (!["y", "yes", "n", "no"].includes(answer.toLowerCase().trim())) {
          console.log(`  ${C.red}Please type y or n${C.reset}`);
        }
      }

      const approved = ["y", "yes"].includes(answer.toLowerCase().trim());

      console.log();
      if (approved) {
        console.log(`  ${C.green}${C.bold}✅ Approved — proceeding${C.reset}`);
      } else {
        console.log(
          `  ${C.red}${C.bold}❌ Rejected — action cancelled${C.reset}`,
        );
      }
      console.log();

      rl.close();
      return approved ? "approve" : "reject";
    }
  }

  rl.close();
  return "approve";
}

// ─────────────────────────────────────────────────────────────────────────────
//  RUN ONE TURN (logic unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function runTurn(userMessage: string, threadId: string) {
  divider(`🧠 ROXO — Thread: ${threadId}`);
  log("USER", C.blue, userMessage);
  console.log();

  const config = { configurable: { thread_id: threadId } };

  await streamRoxo(
    { messages: [{ role: "user", content: userMessage }] },
    config,
  );

  while (true) {
    const state = await roxo.getState(config);
    const pendingInterrupts = (state?.tasks ?? [])
      .flatMap((t: any) => t.interrupts ?? [])
      .map((i: any) => i.value);

    if (!pendingInterrupts.length) break;

    const decision = await handleInterrupt(pendingInterrupts);
    divider("▶  RESUMING");

    await streamRoxo(
      new Command({ resume: { decisions: [{ type: decision }] } }),
      config,
    );
  }

  divider("✅ TURN COMPLETE");
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN LOOP (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  divider("🚀 ROXO — Deep Agents");

  console.log(`${C.gray}
  CONSOLE OUTPUT:
    ◆ Subagent called: <id>   ← subagent started
    → calling <tool>          ← tool called (no data shown)
    ✓ <tool> succeeded        ← tool returned ok
    ✗ <tool> failed: <msg>    ← tool error
    ◇ Subagent done: <id>     ← subagent finished

  ARCHITECTURE:
  ┌──────────────────────────────────────────────────┐
  │         ROXO  (createDeepAgent)                  │
  │  • add_task_to_sprint          [HITL ⏸]           │
  │  • task("project-basics-intel") → subagent [READ] │
  │  • task("insights-intel")       → subagent [READ] │
  └──────────────────────────────────────────────────┘

  Try:
  1. Show me all tasks
  2. Are we at risk of missing our deadline?
  3. Add the API docs task to Sprint 5

  Type 'quit' to exit.
${C.reset}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
  const threadId = `roxo-${Date.now()}`;
  log("SESSION", C.gray, `Thread: ${threadId}`);

  while (true) {
    const input = await ask(`\n${C.bold}${C.blue}You: ${C.reset}`);
    if (!input.trim()) continue;
    if (["quit", "exit"].includes(input.toLowerCase())) {
      console.log(`\n${C.gray}Goodbye! 👋${C.reset}`);
      rl.close();
      break;
    }
    try {
      await runTurn(input, threadId);
    } catch (err: any) {
      log("ERROR", C.red, err.message ?? String(err));
    }
  }
}

main().catch(console.error);
