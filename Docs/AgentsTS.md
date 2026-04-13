cd my-agent-ts
npm init -y
npm install typescript ts-node @types/node
npm install nodemon --save-dev
npx tsc --init

 KEY INSIGHT: LCEL chains are lazy — they don't run until you
 call .invoke(), .stream(), or .batch(). They're composable
 building blocks, just like React components.

 PYTHON → TYPESCRIPT CHEAT SHEET:
 ┌─────────────────────────────┬──────────────────────────────────────────┐
 │ Python                      │ TypeScript                               │
 ├─────────────────────────────┼──────────────────────────────────────────┤
 │ prompt | model | parser     │ prompt.pipe(model).pipe(parser)          │
 │ BaseModel + Field()         │ z.object() + .describe()                 │
 │ class Foo(BaseModel): ...   │ const Foo = z.object({...})              │
 │ Foo instance                │ z.infer<typeof Foo>                      │
 │ load_dotenv()               │ import "dotenv/config"                   │
 │ for chunk in stream:        │ for await (const chunk of stream)        │
 │ RunnableLambda(fn)          │ RunnableLambda.from(fn)                  │
 └─────────────────────────────┴──────────────────────────────────────────┘

# Building Production-Ready AI Agents with LangGraph & TypeScript

This guide explains the architecture of the `new-multi-agent_02.ts` system, the core concepts powering it, and the roadmap for taking it to production with persistent memory and real-time frontend streaming.

---

## 1. What is this Architecture about?

The current architecture is a **Coordinator-Worker Multi-Agent System**. 

- **The Main Agent (ROXO)** acts as the "Coordinator". It receives the user's request, reasons about what needs to be done, and delegates work to specialized agents.
- **The Subagents (Project Basics & Insights)** act as "Workers". They are scoped to specific tasks (e.g., just reading task data or analyzing velocity). They are attached to the main agent as **Tools**. 
- **Separation of Concerns:** By using subagents, we give them distinct system prompts and restrict their tool access. This ensures the reasoning doesn't get overwhelmed with too many tools and prevents the agent from "hallucinating" actions outside its scope.
- **Write Actions:** Any action that modifies data (like `add_task_to_sprint`) is tightly controlled by the main agent and requires explicit human approval.

Overall, the architecture is **excellent**. It is highly scalable, safe, and modular.

---

## 2. Core Concepts: ReAct, HITL, and Multi-Agent

### ReAct (Reasoning and Acting)
LangGraph’s `createAgent` implements the **ReAct** pattern under the hood. 
1. **Thought:** The LLM receives the input and "thinks" about what to do.
2. **Action:** It decides to call a tool (e.g., `ask_project_basics`).
3. **Observation:** The tool executes and returns the result back to the LLM.
4. The LLM then reasons about the observation and either calls another tool or formulates a final response to the user.

### HITL (Human-In-The-Loop)
You are using `humanInTheLoopMiddleware`. This is critical for production safety. When ROXO tries to execute a sensitive "WRITE" tool (like modifying a sprint), the graph pauses execution (`interruptOn: { add_task_to_sprint: true }`). It waits for a human (you) to supply an "approve" or "reject" decision before resuming.

### Multi-Agent
Rather than one massive AI with 50 tools, you have specialized agents wrapped as tools. When ROXO calls `ask_project_basics`, a completely separate LLM graph runs, does its job, and returns a summary to ROXO. This prevents context bloat and improves accuracy.

---

## 3. Memory Setup (Short-term vs. Long-term)

Right now, you are using `MemorySaver`. This is an in-memory checkpointer. If the server restarts, the conversation thread is lost.

### Moving to PostgresSaver (Thread State)
For production, you must use a persistent checkpointer to store the LangGraph graph state (the conversation history and tool outputs).
```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
// Create a Postgres connection pool
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
await checkpointer.setup(); // Run migrations internally
```
You pass this `checkpointer` into `createAgent()` instead of `MemorySaver`. If a user comes back 3 days later with the same `thread_id`, ROXO will remember the entire context.

### Integrated Mem0 (Semantic / Entity Memory)
While checkpointers store *what happened* in a specific thread, **Mem0** provides cross-thread, long-term semantic memory (e.g., remembering that "Ali prefers backend tasks"). 
To integrate Mem0, you would add a tool that ROXO can call: `update_memory` and `search_memory`, or provide Mem0's retrieved context automatically in ROXO's system prompt on every turn.

---

## 4. How to Move to Production

To make this agent production-ready, follow these steps:

1. **Replace `fakeDB`:** Connect your tools to your actual database (PostgreSQL/Prisma, Convex, Supabase, etc.) and external APIs.
2. **Database Checkpointing (PostgreSQL):** Swap `MemorySaver` for `PostgresSaver` so threads persist across server restarts.
3. **Security & Guardrails:** Add authentication. Ensure that the tools automatically inject the logged-in user's `userId`. Example: `getTasks` should only return tasks the user has permission to see.
4. **Deploy as an API:** Wrap `roxo.streamEvents` inside an Express, Hono, or Next.js API route. You cannot use `readline` (console standard input/output) in a web app!

---

## 5. Streaming Responses & Tool Calls to the Frontend

When moving to the web, you want the user to see the AI typing in real-time and see UI indicators when a tool is running.

### Backend (API Route)
You expose an endpoint that streams the events using Server-Sent Events (SSE) or a streaming HTTP response.
```typescript
// Example Next.js/Express API Route conceptual logic
export async function POST(req: Request) {
  const { messages, threadId } = await req.json();
  const config = { configurable: { thread_id: threadId } };
  
  // Create a ReadableStream from roxo.streamEvents
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of roxo.streamEvents({ messages }, { ...config, version: "v2" })) {
        // Stream the raw event directly to the frontend
        controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    }
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}
```

### Frontend (React / Next.js)
LangChain provides a frontend hook `@langchain/react` built for this exact architecture. It automatically connects to your streaming endpoint and parses the `v2` stream events.

```tsx
import { useStream } from "@langchain/react";

export function AgentChat() {
  const stream = useStream({
    apiUrl: "/api/chat", // Your backend endpoint
  });

  // stream.messages automatically collects the chunks and builds full messages
  return (
    <div>
      {/* 1. Show Tool Calls happening in real-time */}
      {stream.status === "inflight" && stream.runMap && Object.values(stream.runMap).map(run => {
         if (run.run_type === "tool") {
           return <div key={run.id}>Running subagent: {run.name}...</div>
         }
      })}

      {/* 2. Show the Chat Messages */}
      {stream.messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}

      {/* 3. Handle HITL Interrupts */}
      {stream.interrupts.map((interrupt, i) => (
         <div key={i}>
           <p>ROXO wants approval for: {interrupt.value.action_requests[0].name}</p>
           <button onClick={() => stream.submitInterrupt("approve")}>Approve</button>
         </div>
      ))}
    </div>
  );
}
```

### Why this frontend approach works:
1. **`useStream` parses `streamEvents` natively:** It looks for `on_chat_model_stream` to build the paragraph text, and `on_tool_start` to populate the `runMap` so you can show loading spinners for specific subagents.
2. **Interrupts:** When ROXO triggers `humanInTheLoopMiddleware`, `stream.interrupts` is populated. You show a UI dialog, the user clicks "Approve", and `stream.submitInterrupt()` sends the decision back to resume the graph.


<!-- ------LANGCHAIN/REACT FOR USE FOR STREAMING -->
## @langchain/react
React SDK for building AI-powered applications with Deep Agents, LangChain and LangGraph. It provides a useStream hook that manages streaming, state, branching, and interrupts out of the box.

Installation
npm install @langchain/react @langchain/core
Peer dependencies: react (^18 || ^19), @langchain/core (^1.1.27)
