# ============================================================
# LESSON 2: PROMPTS
# Stop hardcoding strings. Build reusable prompt templates.
# ============================================================

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.prompts import (
    ChatPromptTemplate,
    PromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
)
from langchain_core.messages import HumanMessage, AIMessage

load_dotenv()
model = init_chat_model("gpt-4.1-nano", temperature=0)


# ── 1. Basic PromptTemplate (string → string) ────────────────
# Use {variable} placeholders. .format() fills them in.
# basic = PromptTemplate.from_template(
#     "Write a one-line description of a {product_type} called {name}."
# )
# filled = basic.format(product_type="SaaS app", name="TaskFlow")
# print(filled)
# "Write a one-line description of a SaaS app called TaskFlow."




# ── 2. ChatPromptTemplate — the one you'll use 95% of the time
# Build a template for a full system+human message combo.
# chat_prompt = ChatPromptTemplate.from_messages([
#     ("system", "You are an expert {role}. Be concise and practical."),
#     ("human", "{user_input}"),
# ])

# # .format_messages() returns a list of Message objects
# messages = chat_prompt.format_messages(
#     role="product manager",
#     user_input="How should I prioritize my backlog this sprint?",
# )
# print(messages)
# # [SystemMessage(...), HumanMessage(...)]

# response = model.invoke(messages)
# print(response.content)


# ── 3. MessagesPlaceholder — inject dynamic history ──────────
# This is how you handle multi-turn chat memory.
# The {history} slot gets replaced by an actual list of messages.

conversational_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful PM assistant."),
    MessagesPlaceholder(variable_name="history"),  # ← inject past messages here
    ("human", "{user_input}"),
])

# Simulating 2 past turns of conversation
history = [
    HumanMessage("I'm building a task manager app."),
    AIMessage("Great! Who's your target user?"),
    HumanMessage("Small dev teams, 2-10 people."),
    AIMessage("Got it. What's your core differentiator?"),
]

messages = conversational_prompt.format_messages(
    history=history,
    user_input="Help me write the tagline for the landing page.",
)
print(model.invoke(messages).content)