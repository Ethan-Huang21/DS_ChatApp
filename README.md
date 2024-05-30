# YouChat
YouChat is a Distributed Chat Application that was made during the Winter Semester of 2024 for the course CPSC559 in at the University of Calgary.

It utilizes techinques like leader election to preserve synchronization of data across existing servers via websockets.

Alongside this, it's built for the purpose of displaying the fault tolerance of distributed systems, in which computer or execution failures don't affect the overall execution.

## Tech Stack
  - React + Tailwind CSS (Frontend)
  - Javascript / NodeJS (Proxy / Middleware)
  - Pocketbase extended with Go (Backend)
      * Docker | Python -> There exists a Python script (replication.py) that creates Docker containerizations of PB+Go Servers.
      * However, this is primarily for testing purposes as it doesn't fully function with the load balancer, as it's setup in the manner that containers operate within their own networks, which isn't accessible without the proper flags.

## Execution
  - go run main.go serve
      * To run Pocketbase extended with Go back-end servers
      * alt: go run main.go serve --http="127.0.0.1:3000" -> Runs on Port 3000 instead of default 8090
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
