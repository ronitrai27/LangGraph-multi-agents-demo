// ============================================================
// PM AGENT — INTERACTIVE CLI 
//

// KEY FIX vs naive approach:
//   interrupt() inside a tool leaves an unresolved tool_call in
//   message history. If you let the user type a NEW message before
//   the interrupt is resolved → OpenAI 400 (dangling tool_calls).
//
//   Solution: after every stream turn, call agent.getState() and
//   check for pending interrupts. If found, ask for approval NOW
//   (blocking the REPL), resume with Command({ resume }), then
//   run another stream turn — all before returning to the prompt.
//   The user never gets the "You:" prompt until everything resolves.
//
// ============================================================

import "dotenv/config";
import * as readline from "readline";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver, Command } from "@langchain/langgraph";
import { z } from "zod";
import { interrupt } from "@langchain/langgraph";

// ── DEMO DB ───────────────────────────────────────────────────

const DB = {
  tasks: [
    { id: "T-001", title: "Design auth system",       description: "OAuth2 + JWT",           assignee: "alice", status: "in-progress", priority: "high",   durationDays: 5, sprintId: "SP-1" },
    { id: "T-002", title: "Build API rate limiter",   description: "Redis sliding window",   assignee: "bob",   status: "todo",        priority: "medium", durationDays: 3, sprintId: "SP-1" },
    { id: "T-003", title: "Set up CI/CD pipeline",   description: "GitHub Actions + Docker", assignee: "carol", status: "done",        priority: "high",   durationDays: 2, sprintId: "SP-1" },
    { id: "T-004", title: "Database schema migration",description: "v2 → v3 zero downtime",  assignee: "alice", status: "todo",        priority: "high",   durationDays: 4, sprintId: "SP-2" },
    { id: "T-005", title: "Write API documentation", description: "OpenAPI + Postman",       assignee: null,    status: "todo",        priority: "low",    durationDays: 2, sprintId: "SP-2" },
  ],
  issues: [
    { id: "I-001", title: "Login page crashes on Safari",    description: "Webkit CSS issue",     assignee: "bob",   status: "open",        priority: "critical", linkedTaskId: "T-001" },
    { id: "I-002", title: "API returns 500 on empty payload",description: "Missing null check",   assignee: "alice", status: "open",        priority: "high",     linkedTaskId: "T-002" },
    { id: "I-003", title: "Slow query on user listing",      description: "N+1 query problem",    assignee: null,    status: "open",        priority: "medium",   linkedTaskId: null },
    { id: "I-004", title: "Memory leak in background worker",description: "Grows after 6h",       assignee: "carol", status: "in-progress", priority: "high",     linkedTaskId: null },
  ],
  sprints: [
    { id: "SP-1", name: "Sprint 12 – Auth & Infra", startDate: "2025-04-01", endDate: "2025-04-14", status: "active",  goal: "Ship auth system + CI/CD" },
    { id: "SP-2", name: "Sprint 13 – Data & Docs",  startDate: "2025-04-15", endDate: "2025-04-28", status: "planned", goal: "DB migration + API docs"  },
  ],
};

// ── COLORS ────────────────────────────────────────────────────

const c = {
  reset:  (s: string) => `\x1b[0m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
};

// ── TOOLS ─────────────────────────────────────────────────────

const getTasks = tool(
  (input) => {
    let rows = DB.tasks;
    if (input.assignee) rows = rows.filter(t => t.assignee === input.assignee);
    if (input.status)   rows = rows.filter(t => t.status   === input.status);
    if (input.sprintId) rows = rows.filter(t => t.sprintId === input.sprintId);
    return JSON.stringify(rows.length ? rows : "No tasks found.");
  },
  {
    name: "getTasks",
    description: "Query tasks. Optional filters: assignee (name), status (todo/in-progress/done), sprintId.",
    schema: z.object({
      assignee: z.string().optional(),
      status:   z.enum(["todo", "in-progress", "done"]).optional(),
      sprintId: z.string().optional(),
    }),
  }
);

const getIssues = tool(
  (input) => {
    let rows = DB.issues;
    if (input.status)     rows = rows.filter(i => i.status   === input.status);
    if (input.priority)   rows = rows.filter(i => i.priority === input.priority);
    if (input.unassigned) rows = rows.filter(i => i.assignee === null);
    return JSON.stringify(rows.length ? rows : "No issues found.");
  },
  {
    name: "getIssues",
    description: "Query issues. Optional filters: status (open/in-progress), priority (critical/high/medium/low), unassigned (bool).",
    schema: z.object({
      status:     z.enum(["open", "in-progress"]).optional(),
      priority:   z.enum(["critical", "high", "medium", "low"]).optional(),
      unassigned: z.boolean().optional(),
    }),
  }
);

const getSprints = tool(
  (input) => {
    let rows = DB.sprints;
    if (input.status)   rows = rows.filter(s => s.status === input.status);
    if (input.sprintId) rows = rows.filter(s => s.id     === input.sprintId);
    return JSON.stringify(rows.length ? rows : "No sprints found.");
  },
  {
    name: "getSprints",
    description: "Query sprints. Optional filters: status (active/planned), sprintId.",
    schema: z.object({
      status:   z.enum(["active", "planned"]).optional(),
      sprintId: z.string().optional(),
    }),
  }
);

// ── WRITE TOOL WITH HITL ──────────────────────────────────────
// interrupt() pauses the graph here. The REPL will detect this
// via getState() AFTER the stream ends and ask for approval.

const assignTask = tool(
  async (input) => {
    const task = DB.tasks.find(t => t.id === input.taskId);
    if (!task) return `Task ${input.taskId} not found.`;

    // Graph pauses here. State is saved to MemorySaver.
    // IMPORTANT: resume with a string "yes"/"no", NOT a boolean.
    // Command({ resume: false }) throws EmptyInputError — false is
    // treated as empty input by LangGraph. Strings are always safe.
    const decision = interrupt({
      taskId:    task.id,
      taskTitle: task.title,
      from:      task.assignee ?? "(unassigned)",
      to:        input.newAssignee,
    });

    if (decision !== "yes") return `Assignment of "${task.title}" was cancelled.`;

    const prev   = task.assignee ?? "(unassigned)";
    task.assignee = input.newAssignee;
    return `Task ${task.id} reassigned: ${prev} → ${input.newAssignee}`;
  },
  {
    name: "assignTask",
    description: "Reassign a task to a new person. Requires human approval before executing.",
    schema: z.object({
      taskId:      z.string().describe("e.g. T-001"),
      newAssignee: z.string(),
    }),
  }
);

// ── AGENT ─────────────────────────────────────────────────────

const model        = new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 });
const checkpointer = new MemorySaver();

const agent = createReactAgent({
  llm: model,
  tools: [getTasks, getIssues, getSprints, assignTask],
  checkpointer,
  prompt: `You are a senior PM assistant with full access to tasks, issues, and sprints.
Current time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST
Always query data before answering. Use assignTask for reassignments — it requires human approval.
Be concise. Include IDs when listing items.`,
});

const config = { configurable: { thread_id: "cli-001" } };

// ── STREAM ONE TURN ───────────────────────────────────────────
// Streams tokens live + logs tool events.
// After stream ends, checks getState() for pending interrupt.
// If interrupted: asks user, resumes, then recurses for the continuation.

async function runTurn(input: string | Command): Promise<void> {

  const streamInput = (input instanceof Command)
    ? input
    : { messages: [{ role: "user" as const, content: input }] };

  const stream = agent.streamEvents(streamInput, { ...config, version: "v2" });

  let agentStarted = false;

  for await (const event of stream) {

    // ── Live token streaming ────────────────────────────────
    if (event.event === "on_chat_model_stream") {
      const content = event.data?.chunk?.content;
      const text = typeof content === "string"
        ? content
        : (content?.[0]?.text ?? "");

      if (text) {
        if (!agentStarted) {
          process.stdout.write(c.bold("\n🤖  "));
          agentStarted = true;
        }
        process.stdout.write(text);
      }
    }

    // ── Tool call started ───────────────────────────────────
    if (event.event === "on_tool_start") {
      const input = event.data?.input;
      console.log(c.dim(`\n  ┌── 🔧 TOOL CALL → ${c.cyan(event.name)}`));
      console.log(c.dim(`  │   ${JSON.stringify(input)}`));
    }

    // ── Tool call returned ──────────────────────────────────
    // NOTE: this won't fire for assignTask when interrupted —
    // the tool never finishes. That's expected.
    if (event.event === "on_tool_end") {
      const output = event.data?.output;
      const preview = typeof output === "string" && output.length > 100
        ? output.slice(0, 100) + "…"
        : String(output ?? "");
      console.log(c.green(`  └── ✅ TOOL RESULT ← ${event.name}`));
      console.log(c.dim(`      ${preview}\n`));
    }
  }

  if (agentStarted) console.log("\n");

  // ── Check for pending interrupt AFTER stream ends ─────────
  // getState() returns the current checkpoint. If the graph was
  // paused by interrupt(), at least one task will have interrupts.
  const state  = await agent.getState(config);
  const interrupted = state.tasks?.find(
    (t: { interrupts?: unknown[] }) => t.interrupts && t.interrupts.length > 0
  );

  if (!interrupted) return; // normal turn — done

  // ── HITL approval ─────────────────────────────────────────
  const payload = (interrupted.interrupts[0] as { value: Record<string, unknown> }).value;

  console.log(c.yellow("\n  " + "━".repeat(48)));
  console.log(c.yellow(c.bold("  🛑  APPROVAL REQUIRED")));
  console.log(c.yellow("  " + "━".repeat(48)));
  console.log(`    Task  : ${c.bold(String(payload.taskId))} — ${payload.taskTitle}`);
  console.log(`    From  : ${payload.from}`);
  console.log(`    To    : ${c.bold(String(payload.to))}`);
  console.log(c.yellow("  " + "━".repeat(48) + "\n"));

  const answer  = await ask(c.yellow("  Approve? (yes / no): "));
  const decision = answer.trim().toLowerCase() === "yes" ? "yes" : "no";

  console.log(decision === "yes"
    ? c.green("\n  ✅ Approved — continuing...\n")
    : c.red("\n  ❌ Rejected — continuing...\n")
  );

  // Resume with a string. Never pass false — LangGraph throws EmptyInputError.
  await runTurn(new Command({ resume: decision }));
}

// ── READLINE HELPERS ──────────────────────────────────────────

// One-shot question (used for HITL approval)
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// ── MAIN REPL LOOP ────────────────────────────────────────────

async function repl() {
  console.clear();
  console.log(c.bold(c.cyan("╔══════════════════════════════════════════════╗")));
  console.log(c.bold(c.cyan("║       PM Agent — Interactive CLI             ║")));
  console.log(c.bold(c.cyan("╚══════════════════════════════════════════════╝")));
  console.log(c.dim(`  thread: ${config.configurable.thread_id}  |  memory persists across turns`));
  console.log(c.dim("  type  exit  to quit\n"));
  console.log(c.dim("  Try:  What's in the active sprint?"));
  console.log(c.dim("        Who has the most tasks?"));
  console.log(c.dim("        Are there critical issues?"));
  console.log(c.dim("        Assign T-005 to bob.\n"));

  // Persistent rl for the REPL loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question(c.bold("You: "), async (input) => {
      input = input.trim();
      if (!input)           { prompt(); return; }
      if (input === "exit") { console.log(c.dim("\nBye! 👋\n")); rl.close(); return; }

      rl.pause();        // stop rl from consuming stdin while agent runs
      await runTurn(input);
      rl.resume();
      prompt();          // back to prompt only after full turn (incl. HITL) completes
    });
  };

  prompt();
}

repl();