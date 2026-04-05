pip is Python’s package manager.
- U “Install langchain, and if it’s already installed, update it to the latest version.”
pip list - Check installed packages:

# Core LangChain
pip install -U langchain

# LLM providers — both OpenAI and Anthropic
pip install -U langchain-openai
pip install -U langchain-anthropic

# LangGraph — install now, use later
pip install -U langgraph

# LangSmith — observability, you'll want this from day 1
pip install -U langsmith

# Useful utilities
pip install -U python-dotenv   # for .env file loading
pip install -U langchain-community  # extra tools/loaders

# to run 
python my-agent-py/test-setup.py
