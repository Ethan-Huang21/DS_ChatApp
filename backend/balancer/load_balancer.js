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
        console.log('OH SHIT')
        server.listen(port + 1, () => {
            console.log('WebSocket server listening on port ', port + 1);
        })
    }
}

main();