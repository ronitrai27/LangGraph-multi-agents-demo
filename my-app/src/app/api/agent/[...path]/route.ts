/**
 * app/api/agent/[...path]/route.ts
 * ─────────────────────────────────────────────────────────────
 * Implements the minimal LangGraph API surface so that
 * useStream from @langchain/langgraph-sdk/react works with
 * a custom Next.js backend — no LangGraph Platform subscription needed.
 *
 * ENDPOINTS IMPLEMENTED:
 *   POST /api/agent/assistants/search    → return ROXO assistant info
 *   POST /api/agent/threads              → create a new thread
 *   GET  /api/agent/threads/:id/state    → get current thread state (HITL)
 *   POST /api/agent/threads/:id/runs/stream → stream agent run (SSE)
 *
 * SSE EVENT FORMAT (what useStream expects):
 *   event: metadata\ndata: {run_id, attempt}\n\n
 *   event: messages\ndata: [chunkObj, metaObj]\n\n
 *   event: updates\ndata: {nodeName: stateUpdate}\n\n     ← interrupt appears here
 *   event: values\ndata: {messages: [...]}\n\n            ← full state after run
 *   event: end\ndata: {}\n\n
 *
 * HITL FLOW:
 *   1. Stream hits interrupt() inside add_task_to_sprint
 *   2. Route sends: event: updates, data: {__interrupt__: [...]}
 *   3. useStream sets stream.interrupt on frontend
 *   4. User approves/rejects via UI
 *   5. Frontend calls: stream.submit(null, { command: { resume: decision } })
 *   6. Client sends POST /threads/:id/runs/stream with body.command
 *   7. Route calls roxo.stream(new Command({ resume: ... }), config)
 *   8. Graph resumes, tool completes, stream ends normally
 *
 * FRONTEND USAGE:
 *   import { useStream } from "@langchain/langgraph-sdk/react";
 *   const stream = useStream({
 *     apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/agent",
 *     assistantId: "roxo",
 *   });
 *
 * THREAD STORAGE:
 *   In-memory Map — fine for single-instance dev/staging.
 *   For production: replace threadStore with Redis or Postgres.
 *   The checkpointer (MemorySaver in agent.ts) holds graph state separately.
 * ─────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { Command } from "@langchain/langgraph";
import { v4 as uuid } from "uuid";

// Singleton import — checkpointer and graph must be singletons in Next.js.
// In dev, Next.js hot-reloads modules which re-creates the graph.
// In prod (compiled), this is a true singleton per server process.
import { roxo } from "@/modules/ai/agent";

// ─────────────────────────────────────────────────────────────
//  THREAD STORE
//  Maps thread_id → metadata. The actual graph state lives in
//  the MemorySaver checkpointer inside agent.ts.
//  Production: move this to Redis with TTL or Postgres.
// ─────────────────────────────────────────────────────────────

interface ThreadRecord {
  thread_id: string;
  created_at: string;
  updated_at: string;
  status: "idle" | "busy" | "interrupted" | "error";
  metadata: Record<string, unknown>;
}

// Module-level map — persists across requests in same process
const threadStore = new Map<string, ThreadRecord>();

// ─────────────────────────────────────────────────────────────
//  SSE HELPERS
// ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─────────────────────────────────────────────────────────────
//  ROUTE PARAMS HELPER
// ─────────────────────────────────────────────────────────────

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function getPath(ctx: RouteContext): Promise<string> {
  const { path } = await ctx.params;
  return path.join("/");
}

// ─────────────────────────────────────────────────────────────
//  POST HANDLER
//  Handles: assistants/search | threads | threads/:id/runs/stream
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, ctx: RouteContext) {
  const path = await getPath(ctx);

  // ── POST /assistants/search ────────────────────────────────
  // useStream calls this on mount to verify the assistant exists.
  // Return a static descriptor matching your assistantId.
  if (path === "assistants/search") {
    return NextResponse.json([
      {
        assistant_id: "roxo",
        graph_id: "roxo",
        name: "ROXO",
        description: "AI PM agent for WEkraft",
        metadata: {},
        config: { configurable: {} },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  // ── POST /threads ──────────────────────────────────────────
  // useStream calls this to create a new thread before streaming.
  if (path === "threads") {
    const thread_id = uuid();
    const now = new Date().toISOString();
    const record: ThreadRecord = {
      thread_id,
      created_at: now,
      updated_at: now,
      status: "idle",
      metadata: {},
    };
    threadStore.set(thread_id, record);

    return NextResponse.json({
      thread_id: record.thread_id,
      created_at: record.created_at,
      updated_at: record.updated_at,
      status: record.status,
      metadata: record.metadata,
    });
  }

  // ── POST /threads/:id/runs/stream ──────────────────────────
  // Main streaming endpoint. Two cases:
  //   body.input   → fresh run (human message)
  //   body.command → resume after interrupt (approve/reject)
  const streamMatch = path.match(/^threads\/([^/]+)\/runs\/stream$/);
  if (streamMatch) {
    const thread_id = streamMatch[1];

    let body: {
      input?: { messages: Array<{ type: string; content: string }> };
      command?: { resume: unknown };
      config?: { configurable?: Record<string, unknown> };
      stream_mode?: string[];
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const thread = threadStore.get(thread_id);
    if (!thread) {
      return NextResponse.json(
        { error: `Thread ${thread_id} not found` },
        { status: 404 },
      );
    }

    thread.status = "busy";
    thread.updated_at = new Date().toISOString();

    // ── Build agent input ──────────────────────────────────
    // Two paths:
    //   Normal run:   body.input = { messages: [...] }
    //   Resume HITL:  body.command = { resume: { decisions: [...] } }
    const agentInput = body.command
      ? new Command({ resume: body.command.resume })
      : (body.input ?? { messages: [] });

    const agentConfig = {
      configurable: {
        thread_id,
        ...(body.config?.configurable ?? {}),
      },
    };

    // ── SSE ReadableStream ─────────────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        const run_id = uuid();

        const enqueue = (event: string, data: unknown) => {
          try {
            controller.enqueue(sseEvent(event, data));
          } catch {
            // Client disconnected — ignore
          }
        };

        try {
          // Send run metadata first (required by LangGraph SDK client)
          enqueue("metadata", { run_id, attempt: 1 });

          // ── Stream the agent ─────────────────────────────
          // Support multiple stream modes based on client request or defaults
          const requestedModes = body.stream_mode || [
            "messages",
            "updates",
            "tools",
          ];

          const agentStream = await roxo.stream(agentInput as any, {
            ...agentConfig,
            streamMode: requestedModes as any,
          });

          let interrupted = false;

          for await (const chunk of agentStream as any) {
            const [mode, data] = Array.isArray(chunk) ? chunk : [null, chunk];

            // Forward technical modes directly
            if (
              mode === "messages" ||
              mode === "updates" ||
              mode === "tools" ||
              mode === "values"
            ) {
              let payload = data;

              // Normalize values chunks to ensure messages are serialized correctly
              if (mode === "values" && data && (data as any).messages) {
                payload = {
                  ...data,
                  messages: (data as any).messages.map((m: any) => ({
                    id: m.id,
                    type: m.getType ? m.getType() : m.type || m.role || "ai",
                    content: m.content,
                  })),
                };
              }

              enqueue(mode, payload);

              // Detect interrupt
              if (
                mode === "updates" &&
                data &&
                typeof data === "object" &&
                "__interrupt__" in data
              ) {
                interrupted = true;
                thread.status = "interrupted";
              }
            } else {
              // Fallback for single mode streams
              enqueue(mode || "updates", data);
            }
          }

          // ── Post-run: emit final values state ─────────────
          // CRITICAL: We MUST normalize LangChain messages for JSON serialization
          // so the frontend useStream doesn't lose them.
          if (!interrupted) {
            try {
              const state = await roxo.getState(agentConfig);
              const values = { ...state.values };

              if (Array.isArray(values.messages)) {
                values.messages = values.messages.map((m: any) => ({
                  id: m.id,
                  type: m.getType ? m.getType() : m.type || m.role || "ai",
                  content: m.content,
                  metadata: m.metadata || {},
                  tool_calls: m.tool_calls || [],
                }));
              }

              enqueue("values", values);
              thread.status = "idle";
            } catch (err) {
              console.error("[route] getState error:", err);
              thread.status = "idle";
            }
          }

          enqueue("end", {});
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[route] Stream error:", err);
          enqueue("error", { message: msg });
          thread.status = "error";
        } finally {
          thread.updated_at = new Date().toISOString();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        // These headers are required for SSE to work through Vercel/Next.js
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Allow useStream to read the response in the browser
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no", // disable nginx buffering (important on Vercel)
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ─────────────────────────────────────────────────────────────
//  GET HANDLER
//  Handles: threads/:id/state
//
//  useStream calls this after an interrupt to read the pending
//  interrupt value and display it in stream.interrupt.
// ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, ctx: RouteContext) {
  const path = await getPath(ctx);

  // ── GET /threads/:id/state ─────────────────────────────────
  const stateMatch = path.match(/^threads\/([^/]+)\/state$/);
  if (stateMatch) {
    const thread_id = stateMatch[1];

    const thread = threadStore.get(thread_id);
    if (!thread) {
      return NextResponse.json(
        { error: `Thread ${thread_id} not found` },
        { status: 404 },
      );
    }

    try {
      const state = await roxo.getState({ configurable: { thread_id } });

      return NextResponse.json({
        // LangGraph state shape expected by SDK
        values: state.values,
        next: state.next,
        tasks: state.tasks,
        metadata: state.metadata ?? {},
        created_at: thread.created_at,
        checkpoint: (state as any).checkpoint ?? null,
        parent_checkpoint: (state as any).parentConfig?.configurable
          ?.checkpoint_id
          ? {
              checkpoint_id: (state as any).parentConfig.configurable
                .checkpoint_id,
            }
          : null,
      });
    } catch {
      // No checkpoint exists yet (thread created but no run)
      return NextResponse.json({
        values: {},
        next: [],
        tasks: [],
        metadata: {},
        created_at: thread.created_at,
        checkpoint: null,
        parent_checkpoint: null,
      });
    }
  }

  // ── GET /threads/:id ───────────────────────────────────────
  const threadMatch = path.match(/^threads\/([^/]+)$/);
  if (threadMatch) {
    const thread_id = threadMatch[1];
    const thread = threadStore.get(thread_id);
    if (!thread)
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    return NextResponse.json(thread);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ─────────────────────────────────────────────────────────────
//  OPTIONS — CORS preflight (needed if frontend is on different port)
// ─────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
