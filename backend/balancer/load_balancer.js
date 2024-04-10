import { WebSocketServer, WebSocket } from 'ws';
import http from 'http'
import PocketBase from 'pocketbase'
import { generate } from "random-words";


const server = http.createServer();
const wss = new WebSocketServer({ server });

let pb;
let clients = new Set();
const serverList = [
    "http://127.0.0.1:5001",
    "http://127.0.0.1:5002",
    "http://127.0.0.1:5003",
];

const getMessages = async (pb) => {
    const results = await pb.collection('messages').getFullList();
    for (let result of results) {
        try {
            const username = (await pb.collection('users').getOne(result.user)).username;
            result.username = username;
        }catch(e){
            console.log("User not found, using user id instead.");
            result.username = result.id;
        }
    }
    return results.map(r => { return { id: r.id, content: r.content, username: r.username, time: r.created } });
};

const createUser = async (pb) => {
    const username = generate({ minLength: 10 });
    const user = await pb.collection('users').create({ username });
    return user;
}

const getUser = async (pb, username) => {
    const user = await pb.collection('users').getOne(username);
    return user;
}

const checkMainHealth = async () => {
    try {
        await pb.health.check();
    }
    catch (e) {
        console.log("Disconnected. Trying to connect to a new server");
        for (let server of serverList) {
            try {
                const res = await fetch(server + "/api/health");
                const data = await res.json();
                console.log("Found a new server! " + server);
                if (data.code == 200) {
                    pb = new PocketBase(server);
                    pb.autoCancellation(false);
                    await pb.admins.authWithPassword("junyi.li@ucalgary.ca", "123123123123");
                    break;
                }
            }
            catch (e) {
                continue;
            }
        }
    }

}

wss.on('connection', async (ws, req) => {
    console.log('Client connected');

    // Check the server's health
    await checkMainHealth();

    // Use the WHATWG URL class to parse query parameters from the request URL
    const queryParams = new URL(req.url, `ws://${req.headers.host}`).searchParams;

    // Retrieve the userID from the query parameters
    const userID = queryParams.get('userID');

    let user;
    if (userID !== 'undefined' && userID !== null) {
        // A userID was passed, so retrieve the existing user
        // Assuming getUser is a function you'd implement to retrieve a user by userID
        try {
            user = await getUser(pb, userID);
        } catch (e) {
            console.log("User not found, creating a new user.");
            user = await createUser(pb);
        }
    } else {
        // No userID was passed, so create a new user
        // Assuming pb is some parameter you have previously defined that createUser needs
        user = await createUser(pb);
    }

    // Send the user object back to the client
    ws.send(JSON.stringify(user));

    clients.add(ws);

    // Handle messages from the client
    ws.on('message', async (message) => {
        console.log(`Received message: ${message}`);
        const data = JSON.parse(message);
        const messageContent = data.content;
        const user = data.user;
        console.log(`The user ${user}`);
        console.log(`The content ${messageContent}`)

        await checkMainHealth();
        const result = await pb.collection('messages').create({ content: messageContent, user: user });
        //broadcast to clients
        await sendMessagesToClient();
    });


    const sendMessagesToClient = async () => {
        try {
            const messages = await getMessages(pb);
            const messagesString = JSON.stringify(messages);
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(messagesString);
                }
            });
        } catch (error) {
            console.error('Error sending messages to client:', error);
        }
    };
    await sendMessagesToClient();

    // Handle disconnection
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});


const initializePocketBase = async () => {
    pb = new PocketBase("http://127.0.0.1:8090");
    pb.autoCancellation(false);
    await pb.admins.authWithPassword("junyi.li@ucalgary.ca", "123123123123");
    const messages = await getMessages(pb);
    console.log("Messages: ", messages);
}

const main = async () => {
    try {
        await initializePocketBase();
        // await test();
        // Check if a port argument is provided
        const portArgIndex = process.argv.indexOf('--port');
        if (portArgIndex !== -1 && portArgIndex + 1 < process.argv.length) {
            const port = parseInt(process.argv[portArgIndex + 1]);
            if (!isNaN(port)) {
                startServer(port);
            } else {
                console.error('Invalid port number specified');
            }
        } else {
            console.error('Please specify a port number using --port <port>');
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

const startServer = (port) => {

    // Start the server
    // this is probably very bad practice change later
    try {
        server.listen(port, () => {
            console.log('WebSocket server listening on port ', port);
        });
    }
    catch {
        server.listen(port + 1, () => {
            console.log('WebSocket server listening on port ', port + 1);
        })
    }
}

main();