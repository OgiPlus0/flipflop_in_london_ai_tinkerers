import time
from typing import Dict, List
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
AGENT_CONFIGS: Dict[str, str] = {
    "TodoListAgent": "You are an expert todo list writer. Your job is to extract actionable items from a request and format them as a numbered list.",
    "SummaryAgent": "You are an expert summary writer. Your job is to provide a brief, accurate, and neutral summary of the input text.",
    "EmailCalendarAgent": "You are an expert at writing emails and setting calendars"
} 

AGENTS = {
   "SummaryAgent": MessageAgent(AGENT_CONFIGS["SummaryAgent"]),
   "TodoListAgent": MessageAgent(AGENT_CONFIGS["TodoListAgent"]),
   "EmailCalendarAgent": EmailCalendarAgent()
}

CHOICE_AGENT = ChoiceAgent(AGENT_CONFIGS)
  
def update_vector_store_server(conn: socket, id: str, text: str):
  update_vector_store(id, text)

def server_program():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((HOST, PORT))
        print(f"Server started, listening on {HOST}:{PORT}")
        server_socket.listen(1)
        
        while True: 
            conn, addr = server_socket.accept()
            print(f"Connection established with client at {addr}")
            
            with conn: 
                while True: 
                    data = conn.recv(BUFFER_SIZE)
                    
                    if not data:
                        print(f"Client at {addr} disconnected.")
                        break 
                    
                    try:
                        recieved_data = json.loads(data.decode('utf-8'))
                        
                        if recieved_data["type"] == "0":
                            agent = recieved_data["id"]
                            response_data = AGENTS[agent].action(recieved_data["data"]) if agent in AGENTS.keys() else "not a valid agent"
                            conn.send(json.dumps({"type": "0", "id": "123", "data": response_data}).encode())
                        else:
                            update_vector_store_server(conn, recieved_data["id"], recieved_data["data"])
                            response_data = CHOICE_AGENT.action("Give me an appropriate agent for the context")
                            conn.send(json.dumps({"type": "1", "id": "2112", "data": response_data}).encode())
                            
                    except json.JSONDecodeError as e:
                        print(f"JSON Error: {e}")

def main():
  try:
      server_program()
  except KeyboardInterrupt:
      print("\nServer shutting down.")
  except Exception as e:
      print(f"An error occurred: {e}")

if __name__ == "__main__":
  main()