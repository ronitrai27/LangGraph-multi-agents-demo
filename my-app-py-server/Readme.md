# Customer Support Agent — FastAPI + LangGraph

## Architecture

```
Browser / Next.js
    │  POST /agent  (SSE)
    ▼
FastAPI  server.py
    │  graph.astream(stream_mode=["messages","updates","custom"])
    ▼
LangGraph Graph
    ├─ supervisor node       ← main LLM, decides what to do
    │      │
    │   assign_tool()        ← conditional edge, uses Send() for fan-out
    │      │
    ├─ order_agent node      ← invokes ReAct subagent (get_order, list_customer_orders)
    ├─ refund_agent node     ← invokes ReAct subagent (check_refund_eligibility, process_refund)
    └─ update_order node     ← HITL: interrupt() → human approves → writes to DB
```

## SSE Events emitted

| Event           | When                                      | Frontend use                      |
|-----------------|-------------------------------------------|-----------------------------------|
| `message_chunk` | Every LLM token                           | Typing effect, tool_call badges   |
| `checkpoint`    | After each node finishes                  | Create AppCheckpoint in state     |
| `custom`        | Mid-node via `get_stream_writer()`        | Loading spinner per subagent      |
| `interrupt`     | When `interrupt()` is called              | Show approve/cancel HITL card     |
| `error`         | Exception in stream                       | Error toast in UI                 |

## Fake DB — orders you can test with

| Order ID | Customer       | Product           | Status     | Amount    |
|----------|----------------|-------------------|------------|-----------|
| ORD-001  | Alice Johnson  | MacBook Pro 14    | shipped    | $2,499.99 |
| ORD-002  | Alice Johnson  | AirPods Pro 2     | delivered  | $249.99   |
| ORD-003  | Bob Smith      | iPhone 16 Pro     | processing | $1,199.99 |
| ORD-004  | Bob Smith      | iPad Air M2       | delivered  | $749.99   |
| ORD-005  | Charlie Lee    | Apple Watch Ultra | delivered  | $799.99   |

## Setup

```bash
cd support_agent
poetry run python server.py

# Add your OpenAI key
echo "OPENAI_API_KEY=sk-..." > .env

# Run the server
python server.py
# or: uvicorn server:app --reload --port 8000
```

## TOOLS Html

visit -> tools_reference_card.html

Order subagent → read only (just looks up data, changes nothing)
Refund subagent → read + write (check_eligibility is read, process_refund actually writes to the DB and changes order status to "refunded")
Supervisor/main agent → has the one dangerous write tool (update_order_status) but it's locked behind human approval before anything gets written
So the pattern is really:

Safe reads → subagents do it freely, no approval needed
Risky writes → either the refund subagent does it automatically (because it's a standard operation with clear rules), or it goes through HITL (because update_order_status is a manual admin override that could set any arbitrary status)

## Test with curl

### 1. New message
```bash
curl -N -X POST http://localhost:8000/agent \
  -H "Content-Type: application/json" \
  -d '{"type":"message","message":"What is the status of order ORD-001?","thread_id":"test-1"}'
```

### 2. Ask for a refund
```bash
curl -N -X POST http://localhost:8000/agent \
  -H "Content-Type: application/json" \
  -d '{"type":"message","message":"I want to refund order ORD-002","thread_id":"test-2"}'
```

### 3. Trigger HITL (update order status)
```bash
# Step 1 — triggers interrupt, graph pauses
curl -N -X POST http://localhost:8000/agent \
  -H "Content-Type: application/json" \
  -d '{"type":"message","message":"Please cancel order ORD-003","thread_id":"test-3"}'

# Step 2 — resume with approval (use SAME thread_id)
curl -N -X POST http://localhost:8000/agent \
  -H "Content-Type: application/json" \
  -d '{"type":"resume","resume":"approve","thread_id":"test-3"}'
```



### PY LOGS TO SEE HOW IT WORKS
## App started with new thread 
[/history] Called with thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67
[/history] Returning 0 records for thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67
INFO:     127.0.0.1:61080 - "GET /history?thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67 HTTP/1.1" 200 OK
[/history] Called with thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67
[/history] Returning 0 records for thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67
INFO:     127.0.0.1:61080 - "GET /history?thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67 HTTP/1.1" 200 OK

## asked show all orders for John 
[format_state_snapshot] Serializing 3 messages
[_serialize_message] type=HumanMessage, id=73253581-13d2-4be0-a14e-7ac23ee70d9e
[_serialize_message] type=AIMessage, id=lc_run--019d8b0f-4342-74d2-83f1-b48005957da1
[_serialize_message] Has tool_calls: ['ask_order_agent']
[_serialize_message] type=ToolMessage, id=79874552-bdc9-41dd-8e93-7995c67c9423
[_serialize_message] Is tool result: tool_call_id=call_KNfsifche9x5mjWO33lUQKuN, name=ask_order_agent
[format_state_snapshot] next=['supervisor'], metadata={'source': 'loop', 'step': 2, 'parents': {}}
[format_state_snapshot] 1 task(s) found
[checkpoint_event] next=['supervisor'], keys_in_values=['messages']
[generate_events] chunk_type=debug
[generate_events] debug sub-type=task
[generate_events] chunk_type=messages
[generate_events] message chunk from node=supervisor, type=AIMessageChunk
[generate_events] AIMessageChunk has no content, skipping
[generate_events] chunk_type=messages
[generate_events] message chunk from node=supervisor, type=AIMessageChunk
[generate_events] Emitting message_chunk, content_len=5, tool_call_chunks=0
[message_chunk_event] node=supervisor, msg_id=lc_run--019d8b0f-51fa-7a31-85c6-a228d903f5a6
[message_chunk_event] content_len=5, tool_call_chunks=0, tool_calls=0
[generate_events] chunk_type=messages
[generate_events] message chunk from node=supervisor, type=AIMessageChunk
[generate_events] Emitting message_chunk, content_len=4, tool_call_chunks=0
[message_chunk_event] node=supervisor, msg_id=lc_run--019d8b0f-51fa-7a31-85c6-a228d903f5a6
[message_chunk_event] content_len=4, tool_call_chunks=0, tool_calls=0


## asked status order od ord-001 
[format_state_snapshot] Serializing 8 messages
[_serialize_message] type=HumanMessage, id=73253581-13d2-4be0-a14e-7ac23ee70d9e
[_serialize_message] type=AIMessage, id=lc_run--019d8b0f-4342-74d2-83f1-b48005957da1
[_serialize_message] Has tool_calls: ['ask_order_agent']
[_serialize_message] type=ToolMessage, id=79874552-bdc9-41dd-8e93-7995c67c9423
[_serialize_message] Is tool result: tool_call_id=call_KNfsifche9x5mjWO33lUQKuN, name=ask_order_agent
[_serialize_message] type=AIMessage, id=lc_run--019d8b0f-51fa-7a31-85c6-a228d903f5a6
[_serialize_message] type=HumanMessage, id=b9b9690f-513f-46ea-86ea-d3ee0459849e
[_serialize_message] type=AIMessage, id=lc_run--019d8b10-419b-7c12-ae59-0da04064081c
[_serialize_message] Has tool_calls: ['ask_order_agent']
[_serialize_message] type=ToolMessage, id=ad792356-87ab-4ccf-9fcf-dc7a8f802746
[_serialize_message] Is tool result: tool_call_id=call_h0x5BaJ3gVLqCygDCiJOrb9O, name=ask_order_agent
[_serialize_message] type=AIMessage, id=lc_run--019d8b10-4b4d-7be0-803f-e0d68dfe7c14
[format_state_snapshot] next=[], metadata={'source': 'loop', 'step': 8, 'parents': {}}
[format_state_snapshot] 0 task(s) found
[checkpoint_event] next=[], keys_in_values=['messages']
[generate_events] Stream ended for thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67

## cancel order ord-003
[format_state_snapshot] 1 task(s) found
[checkpoint_event] next=['update_order'], keys_in_values=['messages']
[generate_events] chunk_type=debug
[generate_events] debug sub-type=task
[generate_events] chunk_type=updates
[generate_events] Unknown chunk_type=updates, skipping
[generate_events] chunk_type=debug
[generate_events] debug sub-type=task_result
[generate_events] Emitting interrupt event, interrupts=[{'value': {'message': 'Approve status update for order ORD-003?', 'order_id': 'ORD-003', 'product': 'iPhone 16 Pro', 'current_status': 'processing', 'new_status': 'cancelled', 'reason': 'Customer requested cancellation', 'amount': 1199.99}, 'id': '5e461ea39b14d9d43c35fa3249a9a170'}]
[interrupt_event] 1 interrupt(s) received
[interrupt_event] interrupt value={'message': 'Approve status update for order ORD-003?', 'order_id': 'ORD-003', 'product': 'iPhone 16 Pro', 'current_status': 'processing', 'new_status': 'cancelled', 'reason': 'Customer requested cancellation', 'amount': 1199.99}, id=5e461ea39b14d9d43c35fa3249a9a170
[generate_events] Stream ended for thread_id=d0cbd8f8-93df-415c-9010-b20a3d509d67