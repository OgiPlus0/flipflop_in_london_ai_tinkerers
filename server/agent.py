from typing import Dict, List, Optional
from langchain_redis import RedisVectorStore
from langchain_classic.schema import Document
from langchain_openai import OpenAIEmbeddings
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.redis import RedisSaver
from pydantic import BaseModel, Field
from redis import Redis
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain.tools import tool

REDIS_URL = "redis://localhost:6379"
REDIS_CLIENT = Redis.from_url(REDIS_URL)
EMBEDDINGS = OpenAIEmbeddings()
VECTOR_STORE = RedisVectorStore(embeddings=EMBEDDINGS)
MIN_SIMILARITY_SCORE = 0.75 

@tool
def search_related_notes(query: str) -> str:
    """
    Searches the user's *past* notes and documents for information related to the query.
    
    Use this tool when:
    1. The input refers to existing projects, people, or lists without defining them (e.g., "Add to the marketing list").
    2. You need context from previous documents to accurately summarize or list items.
    
    Do NOT use this tool if the input is self-contained.
    """
    results_with_scores = VECTOR_STORE.similarity_search_with_score(query, k=3)
    
    context_strings = []
    for doc, score in results_with_scores:
        if score >= MIN_SIMILARITY_SCORE:
            source = doc.metadata.get("source", "unknown")
            content = doc.page_content
            context_strings.append(f"[Source: {source}] {content}")
            
    if not context_strings:
        return "No related historical notes found."
        
    return "\n---\n".join(context_strings)

def update_vector_store(id: str, text: str):
  VECTOR_STORE.delete(
      ids=[id]
  )

  document_chunk = Document(
      page_content=text,
      metadata={
          "doc_id": id,
          "source": "source",
          "type": "memo"
      }
  )

  documents_to_add = [document_chunk]
  VECTOR_STORE.add_documents(documents_to_add, ids=[id])


class Agent:
  def action(self, text: str) -> Optional[str]:
    return None

@dataclass
class ResponseFormatMessage:
    helpful_response: str

class MessageAgent(Agent):
  def __init__(self, system_prompt = "You are a helpful assistant"):
    checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
    checkpointer.setup() 

    self.agent = create_agent(
      model="gpt-4.1", 
      tools=[search_related_notes],
      system_prompt=system_prompt,
      response_format=ToolStrategy(ResponseFormatMessage),
      checkpointer=checkpointer,
    )

  def action(self, text: str) -> Optional[str]:
    response = self.agent.invoke(
      {"messages": [{"role": "user", "content": text}]},
      config={"configurable": {"thread_id": 0}} 
    )["structured_response"]

    return response.helpful_response

class TodoListAgent(Agent):
  def __init__(self, system_prompt = "You are a unhelpful assistant"):
    checkpointer = RedisSaver(redis_client=REDIS_CLIENT)
    checkpointer.setup() 

    self.agent = create_agent(
      model="gpt-4.1", 
      tools=[search_related_notes],
      system_prompt=system_prompt,
      response_format=ToolStrategy(ResponseFormatMessage),
      checkpointer=checkpointer,
    )

  def action(self, text: str) -> Optional[str]:
    response = self.agent.invoke(
      {"messages": [{"role": "user", "content": text}]},
      config={"configurable": {"thread_id": 0}} 
    )["structured_response"]

    return response.agent
  

class RouterChoice(BaseModel):
    chosen_agent: str = Field(
        description="The exact name of the agent: 'TodoListAgent' or 'SummaryAgent'"
    )

class ChoiceAgent:
    def __init__(self, agents: Dict[str, str]):
        self.llm = ChatOpenAI(model="gpt-4o", temperature=0) # Use a deterministic model
        
        system_str = (
            "You are a classifier. Given the user input, select the most appropriate agent."
            "\nOPTIONS:\n" + 
            "\n".join([f"{k}: {v}" for k, v in agents.items()])
        )
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", system_str),
            ("user", "{input}")
        ])
        
        self.chain = self.prompt | self.llm.with_structured_output(RouterChoice)

    def action(self, text: str) -> str:
        result = self.chain.invoke({"input": text})
        return result.chosen_agent