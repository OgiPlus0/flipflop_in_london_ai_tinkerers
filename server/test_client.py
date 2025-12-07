import socket
import json
import time

HOST = "127.0.0.1"  # The server's hostname or IP address
PORT = 65432        # The port used by the server
BUFFER_SIZE = 1024

def client_program():
  # Create a socket object for the client
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client_socket:
    while True:
      client_socket.connect((HOST, PORT))
      try:
            # Connect to the server
            print(f"Connected to server at {HOST}:{PORT}")

            data = json.dumps(obj={"type": "1", "id": "10213123", "data": "Please summarize the following text: The Industrial Revolution, spanning the 18th and 19th centuries, marked a major turning point in history. It began in Great Britain and rapidly spread globally, leading to unprecedented economic growth. Key changes included the adoption of new manufacturing processes, the rise of factory systems, and the mechanization of textile production. This era also saw significant social upheaval, urbanization, and major advancements in transportation like the steam engine. I need a short summary of this."})
            client_socket.sendall(data.encode())

            data = client_socket.recv(BUFFER_SIZE)
            recieved_data = json.loads(data.decode('utf-8'))
            print(recieved_data["data"])

            data = json.dumps(obj={"type": "0", "id": "MessageAgent", "data": "What is the weather?"})
            client_socket.sendall(data.encode())

            data = client_socket.recv(BUFFER_SIZE)
            recieved_data = json.loads(data.decode('utf-8'))
            print(recieved_data["data"])

            time.sleep(3)

      except ConnectionRefusedError:
          print("Connection refused. Make sure the server is running.")
      except Exception as e:
          print(f"An error occurred: {e}")

if __name__ == "__main__":
  client_program()