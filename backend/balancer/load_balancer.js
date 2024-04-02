import { WebSocketServer, WebSocket } from 'ws';
import http from 'http'
import PocketBase from 'pocketbase'
import { generate } from "random-words";
import axios from 'axios';



const server = http.createServer();
const wss = new WebSocketServer({ server });

const POCKETBASE_USERNAME_AUTH = "junyi.li@ucalgary.ca";
const POCKETBASE_PASSWORD_AUTH = "123123123123";

let pb;
let clients = new Set();
let replicaPbs = new Set();
const serverList = [
    "http://127.0.0.1:5001",
    "http://127.0.0.1:5002",
    "http://127.0.0.1:5003",
];

const primaryReplica = "http://127.0.0.1:5001";

// gets random replica from set of replicas to read from
const getRandReplicaFromSet = (set) => {
    console.log(set.size);
    let randomIndex = Math.floor(Math.random() * set.size);
    let currentIndex = 0;
    console.log(randomIndex);

    for(let item of set.values()) {
        if (currentIndex === randomIndex) {
            console.log(randomIndex);
            console.log(item);
            return item;
        }
        else currentIndex++;
    }
}

const getMessages = async () => {
    // reads from replica not primary
    const readPb = getRandReplicaFromSet(replicaPbs);
    const results = await readPb.collection('messages').getFullList();
    for (let result of results) {
        const username = (await readPb.collection('users').getOne(result.user)).username;
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
                    await pb.admins.authWithPassword(POCKETBASE_USERNAME_AUTH, POCKETBASE_PASSWORD_AUTH);
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
        //const result = await pb.collection('messages').create({ content: messageContent, user: user });
        const postData = {
            content: messageContent,
            user: user
        }
        axios.post('http://127.0.0.1:8090/hello', postData)
            .then(response => {
                // Handle the response
                console.log('Response:', response.data);
            })
            .catch(error => {
                // Handle errors
                console.error('Error:', error);
            });
        //console.log(result);
        //broadcast to clients
        await sendMessagesToClient();
    });


    const sendMessagesToClient = async () => {
        try {
            const messages = await getMessages();
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
    await pb.admins.authWithPassword(POCKETBASE_USERNAME_AUTH, POCKETBASE_PASSWORD_AUTH);

    // initialize pocketbase replicas for reading

    for(let replica of serverList) {
        const newPb = new PocketBase(replica);
        newPb.autoCancellation(false);
        await newPb.admins.authWithPassword(POCKETBASE_USERNAME_AUTH, POCKETBASE_PASSWORD_AUTH);
        replicaPbs.add(newPb);
    }

    const messages = await getMessages();
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
        console.log('OH SHIT')
        server.listen(port + 1, () => {
            console.log('WebSocket server listening on port ', port + 1);
        })
    }
}

main();