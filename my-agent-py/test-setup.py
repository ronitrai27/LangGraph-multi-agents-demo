from dotenv import load_dotenv
load_dotenv()

# Test OpenAI
from langchain_openai import ChatOpenAI
openai_model = ChatOpenAI(model="gpt-4.1-nano")
response = openai_model.invoke("say: OpenAI working")
print(response.content)

# Test Anthropic
from langchain_anthropic import ChatAnthropic
claude_model = ChatAnthropic(model="claude-sonnet-4-6")
response = claude_model.invoke("say: Anthropic working")
print(response.content)

print("\n✅ Both models connected. Ready to build.")