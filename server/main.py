from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.redis import RedisSaver
from redis import Redis

# --- Your Configuration ---
# Note: Renamed URL to REDIS_URL for clarity
REDIS_URL = "redis://localhost:6379/0" 
SESSION_ID = "test-123" # This will be the thread_id

# We use a dataclass here, but Pydantic models are also supported.
@dataclass
class ResponseFormat:
    # A punny response (always required)
    punny_response: str
    # Any interesting information about the weather if available
    weather_conditions: str | None = None   

def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"

# --- REDIS INTEGRATION ---
# 1. Initialize the Redis client and Saver
redis_client = Redis.from_url(REDIS_URL)
checkpointer = RedisSaver(redis_client=redis_client)
checkpointer.setup()

# 2. Create the Agent with the checkpointer
# The agent will now use this checkpointer to save and load state.
agent = create_agent(
    model="gpt-4.1", # Using a common model string for consistency
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
    response_format=ToolStrategy(ResponseFormat),
    # PASS THE CHECKPOINTER HERE
    checkpointer=checkpointer,
)

# --- INVOKE WITH CONFIG ---
# The checkpointer needs a unique ID to save the conversation thread.
# This is passed via the 'configurable' key in the config dictionary.
# Using the same thread_id allows the conversation to be resumed later.

# FIRST TURN: The agent saves the history to Redis
first_response = agent.invoke(
    {"messages": [{"role": "user", "content": "My name is Finn and I have a pet dog named Max."}]},
    config={"configurable": {"thread_id": SESSION_ID}} # <--- REQUIRED CONFIG
)["structured_response"]

print("--- First Turn Response (Initializes Session) ---")
print(first_response)

# SECOND TURN: The agent loads the history from Redis and remembers the name
second_response = agent.invoke(
    {"messages": [{"role": "user", "content": "What is my dog's name?"}]},
    config={"configurable": {"thread_id": SESSION_ID}} # <--- Using the SAME ID
)["structured_response"].punny_response

print("\n--- Second Turn Response (Uses Memory) ---")
print(second_response)