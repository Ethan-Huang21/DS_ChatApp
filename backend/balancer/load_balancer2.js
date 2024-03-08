import PocketBase from 'pocketbase'
import cors from 'cors'
import express from 'express'
import { generate } from 'random-words'

const app = express();
app.use(cors())

app.use(express.json());


let databases = [];

const subscribeMessages = async (pb) => {
    await pb.collection('messages').subscribe("*", async e => {
        await getMessages(pb);
    })
}

const createUser = async (pb) => {
    const username = generate();
    const user = await pb.collection('users').create({ username });
    //setUser({ id: user.id, username: user.username });
    // setUser({ id: 'w3iacyzlhlickra', username: 'mad' });
};

const test = async () => {
    console.log(databases);
    const messages = await getMessages(databases[0]);
    console.log(messages);
}

const getMessages = async (pb) => {
    const results = await pb.collection('messages').getFullList();
    for (let result of results) {
        const username = (await pb.collection('users').getOne(result.user)).username;
        result.username = username;
    }
    // console.log(results.map(r => { return { id: r.content } }))
    return results.map(r => {return {id: r.id, content: r.content, username: r.username, time: r.created}});
    //setMessages(results.map(r => { return { id: r.id, content: r.content, username: r.username, time: r.created } }));
};

//Define the route
app.get("/hello", async (request, response) => {
    const messages = await getMessages(databases[0]);
    console.log(`Here is the messages: ${messages}`);
    return response.json('hello');
});


const initializePocketBase = async () => {
    const pb = new PocketBase("http://127.0.0.1:8090");
    await pb.admins.authWithPassword("junyi.li@ucalgary.ca", "123123123123");
    databases.push(pb);
    console.log(databases);
    // getMessages(pb);
    // createUser(pb);
    // subscribeMessages(pb);
}


const main = async () => {
    try {
        await initializePocketBase();
        await test();
        startServer(); // Start the server only after initialization is complete
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

const startServer = () => {
    // Specify the port to listen on
    const PORT = 3010;

    // Start the server
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

main();