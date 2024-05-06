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
let replicaPbs = [];
const serverList = [
    "http://10.13.90.99:8090",
    "http://10.13.163.18:8090"
];

let primaryReplica = "http://10.13.189.200:8090";

// gets random replica from set of replicas to read from
const getRandReplicaFromSet = async () => {
    let randomIndex = Math.floor(Math.random() * replicaPbs.length);
    console.log(randomIndex);

    while (true) {
        if (replicaPbs.length == 0)
            return pb;
        try {
            await replicaPbs[randomIndex].health.check();
            return replicaPbs[randomIndex];
        }
        catch (e) {
            console.log(e);
            replicaPbs.splice(randomIndex, 1);
            randomIndex = Math.floor(Math.random() * replicaPbs.length);
        }
    }
}

const getMessages = async () => {
    // reads from replica not primary
    const readPb = await getRandReplicaFromSet();

    const results = await readPb.collection('messages').getFullList();
    for (let result of results) {
        const username = (await readPb.collection('users').getOne(result.user)).username;
        result.username = username;
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
                primaryReplica = server;
                replicaPbs.splice(replicaPbs.indexOf(server), 1)
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
}

// construct message and send http post request to update the database
const sendDatabaseUpdate = async (messageContent, user) => {
    try {
        const postData = {
            content: messageContent,
            user: user
        }
        const response = await axios.post(primaryReplica + '/update', postData)

        // only update client if ack is recieved
        if (response.data === 'ACK') {
            console.log("Ack recieved message sent successfully");
            await sendMessagesToClient();
            return
        }
        else {
            throw new Error('Invalid response recieved');
        }

    }
    catch (error) {
        // Handle errors
        console.error('Error:', error.message);
        // Retry sending after a delay (maybe after a certain amount of retries)
        await new Promise(resolve => setTimeout(resolve, 1)); // Wait for 1 seconds
        await sendDatabaseUpdate(); // Retry sending the request
    }
}

const getUser = async (pb, username) => {
    const user = await pb.collection('users').getOne(username);
    return user;
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
        //const result = await pb.collection('messages').create({ content: messageContent, user: user });

        await sendDatabaseUpdate(messageContent, user);
        //console.log(result);
        //broadcast to clients
        //await sendMessagesToClient();
    });

    await sendMessagesToClient();

    // Handle disconnection
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});


const initializePocketBase = async () => {
    pb = new PocketBase(primaryReplica);
    pb.autoCancellation(false);
    await pb.admins.authWithPassword(POCKETBASE_USERNAME_AUTH, POCKETBASE_PASSWORD_AUTH);

    // initialize pocketbase replicas for reading

    for (let replica of serverList) {
        const newPb = new PocketBase(replica);
        newPb.autoCancellation(false);
        await newPb.admins.authWithPassword(POCKETBASE_USERNAME_AUTH, POCKETBASE_PASSWORD_AUTH);
        replicaPbs.push(newPb);
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
        server.listen(port + 1, () => {
            console.log('WebSocket server listening on port ', port + 1);
        })
    }
}

main();