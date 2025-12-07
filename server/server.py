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
CHOICE_AGENT = ChoiceAgent()
AGENTS = {
   "MessageAgent": MessageAgent()
}
  
def update_vector_store_server(conn: socket, id: str, text: str):
  update_vector_store(id, text)
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
                text = CHOICE_AGENT.action(recieved_data["data"])
                conn.send(json.dumps({"type": "0", "id": "123", "data": AGENTS[text].action(recieved_data["data"])}).encode())
              else:
                update_vector_store_server(conn, recieved_data["id"], recieved_data["data"])


def main():
  try:
      server_program()
  except KeyboardInterrupt:
      print("\nServer shutting down.")
  except Exception as e:
      print(f"An error occurred: {e}")

if __name__ == "__main__":
  main()