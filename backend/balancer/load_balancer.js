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
        const username = (await pb.collection('users').getOne(result.user)).username;
        result.username = username;
    }
    return results.map(r => { return { id: r.id, content: r.content, username: r.username, time: r.created } });
};

const createUser = async (pb) => {
    const username = generate();
    const user = await pb.collection('users').create({ username });
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

wss.on('connection', async (ws) => {
    console.log('Client connected');
    await checkMainHealth();
    const user = await createUser(pb);
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
        startServer(); // Start the server only after initialization is complete
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

const startServer = () => {
    // Specify the port to listen on
    const PORT = 3010;

    // Start the server
    server.listen(PORT, () => {
        console.log('WebSocket server listening on port ', PORT);
    });
}

main();