# server.py — FastAPI server.
#
# Streaming pipeline (mirrors the original project):
#   LangGraph astream() → generate_events() → EventSourceResponse → Next.js proxy → React hook
#
# SSE events emitted:
#   message_chunk  — individual LLM token (used for typing effect + tool_call badges)
#   checkpoint     — node finished, carries state diff
#   custom         — mid-node progress (e.g. "Searching orders…")
#   interrupt      — graph paused for HITL, carries approval payload
#   error          — something went wrong

import asyncio
import uuid
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, AIMessageChunk
from langgraph.types import Command
from sse_starlette.sse import EventSourceResponse

from app.graph import graph
from app.utils import (
    message_chunk_event,
    checkpoint_event,
    interrupt_event,
    custom_event,
    error_event,
    format_state_snapshot,
)

# ─────────────────────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Customer Support Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track live streams so we can stop them via /agent/stop
active_connections: dict[str, asyncio.Event] = {}

print("[SERVER] FastAPI app initialized")


@app.get("/state")
async def state(thread_id: str | None = None):
    """Endpoint returning current graph state."""
    print(f"[/state] Called with thread_id={thread_id}")
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    config = {"configurable": {"thread_id": thread_id}}

    state = await graph.aget_state(config)
    print(
        f"[/state] Got state for thread_id={thread_id}: next={getattr(state, 'next', None)}"
    )
    return format_state_snapshot(state)


@app.get("/history")
async def history(thread_id: str | None = None):
    """Endpoint returning complete state history. Used for restoring graph."""
    print(f"[/history] Called with thread_id={thread_id}")
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    config = {"configurable": {"thread_id": thread_id}}

    records = []
    async for state in graph.aget_state_history(config):
        records.append(format_state_snapshot(state))
    print(f"[/history] Returning {len(records)} records for thread_id={thread_id}")
    return records


# ─────────────────────────────────────────────────────────────────────────────
# Main agent endpoint
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/agent")
async def agent_endpoint(request: Request):
    body: dict = await request.json()
    print(f"[/agent] Received request body: {body}")

    thread_id: str = body.get("thread_id") or str(uuid.uuid4())
    request_type: str = body.get("type", "message")
    print(f"[/agent] thread_id={thread_id}, request_type={request_type}")

    config = {"configurable": {"thread_id": thread_id}}

    if request_type == "run":
        graph_input = body.get("state", None)
        print(f"[/agent] Type=run, graph_input={graph_input}")

    elif request_type == "resume":
        resume_value = body.get("resume", "cancel")
        graph_input = Command(resume=resume_value)
        print(f"[/agent] Type=resume, resume_value={resume_value}")

    elif request_type == "fork":
        config = body.get("config")
        if not config:
            print("[/agent] ERROR: fork request missing config")
            raise HTTPException(status_code=400, detail="config is required for fork")
        fork_state = body.get("state", None)
        print(f"[/agent] Type=fork, config={config}, fork_state={fork_state}")
        config = await graph.aupdate_state(config, fork_state)
        print(f"[/agent] Fork: new config after aupdate_state={config}")
        graph_input = None

    elif request_type == "replay":
        config = body.get("config")
        if not config:
            print("[/agent] ERROR: replay request missing config")
            raise HTTPException(status_code=400, detail="config is required for replay")
        print(f"[/agent] Type=replay, config={config}")
        graph_input = None

    else:
        user_message = body.get("message")
        if user_message:
            graph_input = {"messages": [HumanMessage(content=user_message)]}
            print(f"[/agent] Fallback message type, user_message={user_message}")
        else:
            graph_input = body.get("state", None)
            print(f"[/agent] Fallback no message, graph_input={graph_input}")

    stop_event = asyncio.Event()
    active_connections[thread_id] = stop_event
    print(f"[/agent] Registered stop_event for thread_id={thread_id}")

    async def generate_events() -> AsyncGenerator[dict, None]:
        print(f"[generate_events] Starting stream for thread_id={thread_id}")
        try:
            async for chunk in graph.astream(
                graph_input,
                config,
                stream_mode=["debug", "messages", "updates", "custom"],
            ):
                if stop_event.is_set():
                    print(
                        f"[generate_events] Stop event set, breaking stream for thread_id={thread_id}"
                    )
                    break

                chunk_type, chunk_data = chunk
                print(f"[generate_events] chunk_type={chunk_type}")

                if chunk_type == "debug":
                    debug_type = chunk_data.get("type")
                    print(f"[generate_events] debug sub-type={debug_type}")

                    if debug_type == "checkpoint":
                        print(f"[generate_events] Emitting checkpoint event")
                        yield checkpoint_event(chunk_data["payload"])

                    elif debug_type == "task_result":
                        interrupts = chunk_data["payload"].get("interrupts", [])
                        if interrupts:
                            print(
                                f"[generate_events] Emitting interrupt event, interrupts={interrupts}"
                            )
                            yield interrupt_event(interrupts)
                        else:
                            print(
                                f"[generate_events] task_result has no interrupts, skipping"
                            )

                elif chunk_type == "messages":
                    msg, metadata = chunk_data
                    node_name = metadata.get("langgraph_node", "unknown")
                    print(
                        f"[generate_events] message chunk from node={node_name}, type={type(msg).__name__}"
                    )

                    if isinstance(msg, AIMessageChunk):
                        has_content = bool(msg.content or msg.tool_call_chunks)
                        if has_content:
                            print(
                                f"[generate_events] Emitting message_chunk, content_len={len(msg.content) if isinstance(msg.content, str) else 0}, tool_call_chunks={len(msg.tool_call_chunks or [])}"
                            )
                            yield message_chunk_event(node_name, msg)
                        else:
                            print(
                                f"[generate_events] AIMessageChunk has no content, skipping"
                            )
                    else:
                        print(
                            f"[generate_events] Non-AI message chunk, skipping: {type(msg).__name__}"
                        )

                elif chunk_type == "custom":
                    print(f"[generate_events] Emitting custom event: {chunk_data}")
                    yield custom_event(chunk_data)

                else:
                    print(
                        f"[generate_events] Unknown chunk_type={chunk_type}, skipping"
                    )

        except Exception as exc:
            print(f"[generate_events] ERROR: {exc}")
            yield error_event(str(exc))
        finally:
            active_connections.pop(thread_id, None)
            print(f"[generate_events] Stream ended for thread_id={thread_id}")

    return EventSourceResponse(
        generate_events(),
        headers={
            "X-Thread-Id": thread_id,
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Stop streaming
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/agent/stop")
async def stop_agent(request: Request):
    body: dict = await request.json()
    thread_id: str = body.get("thread_id", "")
    print(f"[/agent/stop] Requested stop for thread_id={thread_id}")
    if thread_id in active_connections:
        active_connections[thread_id].set()
        print(f"[/agent/stop] Stop event set for thread_id={thread_id}")
        return {"status": "stopped", "thread_id": thread_id}
    print(f"[/agent/stop] thread_id={thread_id} not found in active_connections")
    return {"status": "not_found", "thread_id": thread_id}


# ─────────────────────────────────────────────────────────────────────────────
# Debug / inspection endpoints
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/db/orders")
async def debug_orders():
    print("[/db/orders] Fetching in-memory DB")
    from fake_db import ORDERS, REFUNDS, CUSTOMERS

    return {"orders": ORDERS, "refunds": REFUNDS, "customers": CUSTOMERS}


@app.get("/health")
async def health():
    print("[/health] Health check called")
    return {"status": "ok", "agent": "customer_support_v1"}


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    print("[SERVER] Starting uvicorn...")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
