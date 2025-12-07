from typing import List
from langchain_redis import RedisVectorStore
from langchain_classic.schema import Document
from langchain_openai import OpenAIEmbeddings
from dataclasses import dataclass
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.redis import RedisSaver
from redis import Redis

from agent import *

import socket
import json

from redis import Redis

HOST = "127.0.0.1"  
PORT = 65432       
BUFFER_SIZE = 10_000 

# ADD AGENTS HERE AND IN CHOICE_AGENT
system_prompt = (
    "You are a sophisticated and highly efficient **Routing Agent**. "
    "Your function is to analyze the user's complete request and **strictly classify** it by selecting the "
    "**single most appropriate agent** from the available options, and then listing all agents in order of relevance."
    
    "\n\n## Available Agents and Their Roles\n"
    
    "**1. MessageAgent:** Handle all **general conversational queries**, greetings, simple facts, "
    "questions about names, small talk, and any request that does NOT require external data retrieval or specialized tools."
    
    "\n\n## Output Requirements (STRICT)\n"
    "1. **Analyze** the user's input for intent (e.g., General Chat vs. Data Request). "
    "2. **Format the output as a single, comma-separated list** of all available agent names."
    "3. **The FIRST agent in the list MUST be your chosen, most appropriate agent.**"
    "4. **DO NOT** include any conversational filler, punctuation (other than commas), markdown, or explanation."
    
    "\n\n**Example 1 (General Chat):** MessageAgent,KnowledgeAgent"
    "\n\n**Example 2 (Factual Query):** KnowledgeAgent,MessageAgent"
)

CHOICE_AGENT = ChoiceAgent()
AGENTS = {
   "MessageAgent": MessageAgent()
}
  
def update_vector_store_server(conn: socket, id: str, text: str):
  update_vector_store(id, text)

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
              # type: "0" for message, "1" for interact with agent
              # id: number
              # data: 

              if recieved_data["type"] == "0":
                #text = CHOICE_AGENT.action(recieved_data["data"])
                agent = recieved_data["id"]
                if agent in AGENTS.keys():
                  conn.send(json.dumps({"type": "0", "id": "123", "data": AGENTS[recieved_data["id"]].action(recieved_data["data"])}).encode())
                else:
                   conn.send(json.dumps({"type": "0", "id": "123", "data": "not a valid agent"}).encode())
              else:
                update_vector_store_server(conn, recieved_data["id"], recieved_data["data"])
                conn.send(json.dumps({"type": "1", "id": "2112", "data": CHOICE_AGENT.action("Give me an appropriate agent for the context")}).encode())


def main():
  try:
      server_program()
  except KeyboardInterrupt:
      print("\nServer shutting down.")
  except Exception as e:
      print(f"An error occurred: {e}")

if __name__ == "__main__":
  main()