from typing import List
from langchain_redis import RedisVectorStore
from langchain_classic.schema import Document
from langchain_openai import OpenAIEmbeddings
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.redis import RedisSaver
from redis import Redis


import socket
import json

from redis import Redis

@dataclass
class ResponseFormat:
    punny_response: str


HOST = "127.0.0.1"  
PORT = 65432       
BUFFER_SIZE = 10_000 
REDIS_URL = "redis://localhost:6379"
REDIS_CLIENT = Redis.from_url(REDIS_URL)
EMBEDDINGS = OpenAIEmbeddings()
VECTOR_STORE = RedisVectorStore(
    embeddings=EMBEDDINGS
)
def get_context(s: str) -> List[Document]:
    return VECTOR_STORE.similarity_search(s, k=3)

def get_prompt_context(query: str) -> str:
    """Gets information from a query that will be useful to include in a response"""

    retrieved_documents = get_context(query)
    
    context_strings = []
    
    for doc in retrieved_documents:
        source = doc.metadata.get("source", "unknown source")
        content = doc.page_content
        context_strings.append(f"Source: {source}\nContent: {content}\n---")
        
    return "\n".join(context_strings)


CHECKPOINTER = RedisSaver(redis_client=REDIS_CLIENT)
CHECKPOINTER.setup()

AGENT = create_agent(
    model="gpt-4.1", 
    tools=[get_prompt_context],
    system_prompt="You are a helpful assistant",
    response_format=ToolStrategy(ResponseFormat),
    checkpointer=CHECKPOINTER,
)

def send_message(conn: socket, text: str):
  second_response = AGENT.invoke(
    {"messages": [{"role": "user", "content": text}]},
    config={"configurable": {"thread_id": 0}} 
  )["structured_response"]

  conn.send(json.dumps({'type': "0", 'data': second_response.punny_response}).encode())
  
def update_vector_store(conn: socket, id: str, text: str):
  VECTOR_STORE.delete(
      filter={"doc_id": id} 
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
  VECTOR_STORE.add_documents(documents_to_add)

  conn.send(json.dumps({'type': "1", 'id': "324234", 'data': "success"}).encode())

def server_program():
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
      server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

      server_socket.bind((HOST, PORT))
      print(f"Server started, listening on {HOST}:{PORT}")
      
      server_socket.listen(1)
      
      conn, addr = server_socket.accept()
      
      with conn:
          print(f"Connection established with client at {addr}")
          
          while True:
              data = conn.recv(BUFFER_SIZE)
              
              if not data:
                  print("Client disconnected.")
                  break
              
              recieved_data = json.loads(data.decode('utf-8'))
              # type: 0 for message, 1 for interact with agent
              # id: number
              # data: 

              if recieved_data["type"] == "0":
                send_message(conn, recieved_data["data"])
              else:
                update_vector_store(conn, recieved_data["id"], recieved_data["data"])


def main():
  try:
      server_program()
  except KeyboardInterrupt:
      print("\nServer shutting down.")
  except Exception as e:
      print(f"An error occurred: {e}")

if __name__ == "__main__":
  main()