ResearchState adds findings, final_report, iterations on top of MessagesState. The findings list accumulates across loops so the citation agent has all sources at the end.
Different LLMs per layer — supervisor gets gpt-4.1 for planning/synthesis, subagents get gpt-4.1-mini for search/summarize. Cheaper where it matters less.
Citation Agent is not a ReAct agent — it's a single LLM call that runs inside hitl_document before the interrupt fires. No tool loop needed, just text processing. This matches the Anthropic diagram where CitationAgent is downstream of the main loop.
HITL carries a rich payload — report_preview, word_count, summary so your frontend can show a proper approval card, not just "approve/cancel."
_write_docx uses the same Node.js docx pattern from the skill — parses markdown headers/bullets into proper docx structure.

Principal = Supervisor
The principal never does any actual research. He just reads the query that comes in, makes a plan, and assigns work. He has 3 tools on his desk — a phone to call Researcher A, a phone to call Researcher B, and a "create document" stamp. That's it. He doesn't search anything himself.

Two Vice Principals = Researcher A and Researcher B
These are the ReAct agents — meaning they actually think in a loop until they're satisfied.
Researcher A gets the call: "go find academic and web stuff about X." He then independently decides — I'll search Tavily, okay I found something interesting, let me extract that URL, now let me check Google Scholar... he keeps going until he feels the answer is complete. Then he writes up a summary and sends it back up to the Principal.
Researcher B does the same but his specialty is patents, news, and fact-checking.
Both work at the same time (parallel fan-out via Send()).

Teacher = citation_agent
Not a looping agent at all. Just one single task — takes the final report, finds all the URLs buried in it, inserts [1] [2] [3] inline citations, adds a References section at the bottom. Done. Hands it back. No back-and-forth.

Student = You (the user) — HITL
After the teacher formats the report, the graph freezes and shows you a preview. You either say "approve" or "reject". If you approve, the .docx gets written to disk. If you reject, the whole thing gets cancelled and the Principal asks what you want to change.
This freeze is the interrupt() call. The graph literally pauses its checkpoint and waits for your input before it can move forward.

The flow in one line:

You ask → Principal plans → calls both VPs in parallel → both VPs research independently using their tools → both report back to Principal → Principal synthesizes → Teacher adds citations → You approve → .docx is written → Principal gives final reply → done.



## errors
[generate_events] task_result has no interrupts, skipping
[generate_events] ERROR: At key 'findings': Can receive only one value per step. Use an Annotated key to handle multiple values.
For troubleshooting, visit: https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE
[error_event] ERROR: At key 'findings': Can receive only one value per step. Use an Annotated key to handle multiple values.
For troubleshooting, visit: https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE
[generate_events] Stream ended for thread_id=82022bf3-7245-4e0d-a7fa-97f1c85bae17