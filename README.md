# YouChat
YouChat is a Distributed Chat Application that was made during the Winter Semester of 2024 for the course CPSC559 in at the University of Calgary.

It utilizes techinques like leader election to preserve synchronization of data across existing servers via websockets.

Alongside this, it's built for the purpose of displaying the fault tolerance of distributed systems, in which computer or execution failures don't affect the overall execution.

## Tech Stack
  - React + Tailwind CSS (Frontend)
  - Javascript / NodeJS (Proxy / Middleware)
  - Pocketbase extended with Go (Backend)
      * Docker | Python -> There exists a Python script (replication.py) that creates Docker containerizations of PB+Go Servers.
      * In usage, however, due to the Dockerfile relying on local migratory files -- it can break synchronization on monitoring.

## Execution
  - go run main.go serve  | python replication.py (suggested)
      * To run Pocketbase extended with Go back-end servers
      * alt: go run main.go serve --http="127.0.0.1:3000" -> Runs on Port 3000 instead of default 8090
      * Python script links container 8080 port to localhost ports, so access Pocketbase servers via localhost ports 5001, 5002, 5003 (default). Creates a Docker network for inter-container websocket hosting.
      * IF using manual servers (go run main.go serve) -- 
  - npm run dev
      * npm install -> run prior for dependencies
      * To run the React Front-end GUI
  - node load_balancer.js --port [PORT#]
      * npm install -> run prior for dependencies
      * To run the load balancer -> requires front-end and back-end to be active, meaning Front-end is open, and all backend servers in load_balancer.js are open for connection.
      * E.g. node load_balancer.js -port 3010

## Credits
This project was created by a Group of 5:
  * Parker Graham
  * Ethan Huang
  * Junyi Li
  * Jimmy Xu
  * Richi Patel
