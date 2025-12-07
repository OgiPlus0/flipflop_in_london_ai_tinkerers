import socket
import json

HOST = "127.0.0.1"  # The server's hostname or IP address
PORT = 65432        # The port used by the server
BUFFER_SIZE = 1024

def client_program():
  # Create a socket object for the client
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client_socket:
      try:
          # Connect to the server
          client_socket.connect((HOST, PORT))
          print(f"Connected to server at {HOST}:{PORT}")

          data = json.dumps(obj={"type": "1", "id": "10213123", "data": "Its currently sunny"})
          client_socket.sendall(data.encode())

          data = client_socket.recv(BUFFER_SIZE)
          recieved_data = json.loads(data.decode('utf-8'))
          print(recieved_data["data"])

          data = json.dumps(obj={"type": "0", "id": "MessageAgent", "data": "What is the weather?"})
          client_socket.sendall(data.encode())

          data = client_socket.recv(BUFFER_SIZE)
          recieved_data = json.loads(data.decode('utf-8'))
          print(recieved_data["data"])


              
      except ConnectionRefusedError:
          print("Connection refused. Make sure the server is running.")
      except Exception as e:
          print(f"An error occurred: {e}")

if __name__ == "__main__":
  client_program()