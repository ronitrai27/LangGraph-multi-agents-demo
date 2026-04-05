# ============================================================
# LESSON 3: CHAINS (LCEL — LangChain Expression Language)
# Pipe things together with | just like Unix pipes.
# prompt | model | parser → one reusable callable unit.
# ============================================================

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from pydantic import BaseModel, Field

load_dotenv()
openai = init_chat_model("gpt-4.1-nano", model_provider="openai")
claude = init_chat_model("claude-sonnet-4-6", model_provider="anthropic")


# ── 1. The simplest chain: prompt | model | parser ───────────
# StrOutputParser → extracts .content from AIMessage → returns str

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a concise technical writer."),
    ("human", "Summarize what {concept} is in exactly 2 sentences."),
])

chain = prompt | openai | StrOutputParser()

# ---------------------------
# .invoke() on the chain passes a dict matching template variables
# result = chain.invoke({"concept": "vector databases"})
# print(type(result))   # <class 'str'>  ← clean string, not AIMessage
# print(result)

# -------------------------------
# ── 2. Chain is reusable — call it many times ────────────────
# for concept in ["JWT tokens", "webhooks", "rate limiting"]:
#     print(f"\n{concept}:")
#     print(chain.invoke({"concept": concept}))

# -------------------------------
# ── 3. Stream a chain ────────────────────────────────────────
# print("\n--- Streaming chain ---")
# for chunk in chain.stream({"concept": "microservices"}):
#     print(chunk, end="", flush=True)
# print()


# -----------------------------------
# ── 4. Batch a chain ─────────────────────────────────────────
# results = chain.batch([
#     {"concept": "CI/CD"},
#     {"concept": "feature flags"},
#     {"concept": "A/B testing"},
# ])
# for r in results:
#     print(r, "\n")

# --------------------------------
# ── 5. Structured output chain ───────────────────────────────
# Chain that always returns a typed Pydantic object

# class SprintPlan(BaseModel):
#     """A sprint plan."""
#     goal: str = Field(description="The sprint goal in one sentence")
#     tickets: list[str] = Field(description="3-5 ticket titles to include")
#     risks: list[str] = Field(description="Potential blockers or risks")
#     duration_days: int = Field(description="Sprint length in days")

# plan_prompt = ChatPromptTemplate.from_messages([
#     ("system", "You are a senior PM. Create practical sprint plans."),
#     ("human", "Create a sprint plan for: {feature_description}"),
# ])

# # with_structured_output replaces the parser in the chain
# plan_chain = plan_prompt | openai.with_structured_output(SprintPlan)

# plan = plan_chain.invoke({
#     "feature_description": "Building a Slack notification integration for our task manager"
# })

# print(f"Goal: {plan.goal}")
# print(f"Tickets: {plan.tickets}")
# print(f"Risks: {plan.risks}")
# print(f"Duration: {plan.duration_days} days")

# ---------------------------
# ── 6. Chaining chains (pipeline) ────────────────────────────
# Chain 1: user idea → structured feature spec
# Chain 2: feature spec → ticket breakdown
# Connect them: chain1 | chain2

from langchain_core.runnables import RunnableLambda

# Step 1: generate a feature spec (returns Pydantic model)
class FeatureSpec(BaseModel):
    name: str = Field(description="Feature name")
    description: str = Field(description="2 sentence description")
    user_value: str = Field(description="Why users care about this")

spec_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a product strategist."),
    ("human", "Define this feature idea: {idea}"),
])
spec_chain = spec_prompt | claude.with_structured_output(FeatureSpec)

# Step 2: take the spec → write tickets
tickets_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a tech lead writing Jira tickets."),
    ("human", "Break down this feature into dev tickets:\nFeature: {name}\n{description}\nUser value: {user_value}"),
])
tickets_chain = tickets_prompt | openai | StrOutputParser()

# Connect: run spec_chain, extract fields, feed into tickets_chain
def spec_to_dict(spec: FeatureSpec) -> dict:
    return {"name": spec.name, "description": spec.description, "user_value": spec.user_value}

full_pipeline = spec_chain | RunnableLambda(spec_to_dict) | tickets_chain

result = full_pipeline.invoke({"idea": "AI-powered standup summary generator"})
print(result)

# KEY INSIGHT: LCEL chains are lazy — they don't run until you
# call .invoke(), .stream(), or .batch(). They're composable
# building blocks, just like React components.