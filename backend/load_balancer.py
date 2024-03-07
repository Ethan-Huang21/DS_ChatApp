from flask import Flask, request, jsonify
import requests
import random

app = Flask(__name__)

primary_replica = "http://127.0.0.1:8090"
# List of backend servers
backend_servers = ["http://server1:5000", "http://server2:5000", "http://server3:5000"]

def load_balance():
    # Simple round-robin load balancing
    return primary_replica

@app.route('/')
def proxy_request():
    # Get the selected backend server
    selected_server = load_balance()

    # Forward the request to the selected backend server
    response = requests.get(f"{selected_server}{request.full_path}")

    # Return the response from the backend server to the client
    return response.content, response.status_code, response.headers.items()

if __name__ == '__main__':
    app.run(debug=True, port=8000)
