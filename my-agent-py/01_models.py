from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from dotenv import load_dotenv
load_dotenv()

# ── 1. Init both models (swap anytime, same interface) ──────
openai = init_chat_model("gpt-4.1-nano", model_provider="openai")
claude = init_chat_model("claude-sonnet-4-6", model_provider="anthropic")

# ── 2. invoke() → single call, returns AIMessage ────────────
# response = openai.invoke("What is 2 + 2? Answer in one word.")
# print(type(response))        # <class 'langchain_core.messages.ai.AIMessage'>
# print(response.content)      # Four
# print(response.usage_metadata)  # input/output token counts & other meta data 


# ── 3. Messages — the real way to talk to models ────────────
# Every LLM conversation is a list of messages with roles.
# system  = instructions/persona (developer sets this)
# human   = user input
# ai      = model's past responses (for conversation history)

# messages = [
#     SystemMessage("You are a sharp PM who speaks in bullet points only."),
#     HumanMessage("What makes a good PRD?"),
# ]

# response = claude.invoke(messages)
# print(response.content)


# messages = [
#     SystemMessage("You are a helpful assistant."),
#     HumanMessage("My name is Rahul."),
#     AIMessage("Hi Rahul! Nice to meet you."),  
#     HumanMessage("What's my name?"),
# ]
# response = openai.invoke(messages)
# print(response.content)   # "Your name is Rahul."

# ── 5. stream() → get tokens as they arrive ─────────────────
# print("\n--- Streaming ---")
# for chunk in openai.stream("Explain async/await in Python in 3 sentences."):
#     print(chunk.content, end="", flush=True)
# print()


# ── 6. with_structured_output() → returns Python object ─────
# This is huge for agents. Force the model to return typed data.
from pydantic import BaseModel, Field

class Ticket(BaseModel):
    """A PM ticket."""
    title: str = Field(description="Short ticket title")
    priority: str = Field(description="low | medium | high | critical")
    effort_points: int = Field(description="Story points estimate 1-13")
    tags: list[str] = Field(description="Relevant labels")

structured_model = openai.with_structured_output(Ticket)
ticket = structured_model.invoke(
    "The login button is broken on mobile Safari. Users can't sign in."
)
print(type(ticket))        # <class '__main__.Ticket'>
print(ticket.title)        # "Fix login button on mobile Safari"
print(ticket.priority)     # "critical"
print(ticket.effort_points) # 3
print(ticket.tags)         # ["bug", "mobile", "auth"]


# ── 7. model parameters ─────────────────────────────────────
# temperature=0   → deterministic, good for structured tasks
# temperature=1   → creative, good for writing
precise = init_chat_model("gpt-4o-mini", temperature=0, max_tokens=100)
creative = init_chat_model("gpt-4o-mini", temperature=1.0)