import { WebSocketServer, WebSocket } from 'ws';
import http from 'http'
import PocketBase from 'pocketbase'

const server = http.createServer();
const wss = new WebSocketServer({ server });

let databases = [];
let clients = new Set();

const getMessages = async (pb) => {
    const results = await pb.collection('messages').getFullList();
    for (let result of results) {
        const username = (await pb.collection('users').getOne(result.user)).username;
        result.username = username;
    }
    return results.map(r => { return { id: r.id, content: r.content, username: r.username, time: r.created } });
};


wss.on('connection', async (ws) => {
    console.log('Client connected');

    clients.add(ws);

    // Handle messages from the client
    ws.on('message', async (message) => {
        console.log(`Received message: ${message}`);
        const data = JSON.parse(message);
        const messageContent = data.content;
        const user = data.user;
        console.log(`The user ${user}`);
        console.log(`The content ${messageContent}`)
        const result = await databases[0].collection('messages').create({ content: messageContent, user: user });

        //broadcast to clients
        await sendMessagesToClient();
    });


    const sendMessagesToClient = async () => {
        try {
            const messages = await getMessages(databases[0]);
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
    const pb = new PocketBase("http://127.0.0.1:8090");
    await pb.admins.authWithPassword("junyi.li@ucalgary.ca", "123123123123");
    pb.autoCancellation(false);
    databases.push(pb);
    const messages = await getMessages(pb);
    console.log("Messages: ", messages);
    // createUser(pb);
    //subscribeMessages(pb);
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