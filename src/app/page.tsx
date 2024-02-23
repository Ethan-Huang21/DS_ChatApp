'use client'

import { useState, useEffect, useRef } from "react";
import PocketBase from 'pocketbase';
import { generate } from "random-words";

type Message = {
  id: string;
  content: string;
  username: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>();
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [currentPB, setPB] = useState<PocketBase>();

  const effectRan = useRef(false);

  useEffect(() => {
    if (!effectRan.current) {
      const pb = new PocketBase("http://127.0.0.1:8090");
      setPB(pb);
      // createUser(pb);
      getMessages(pb);
    }
    return () => { effectRan.current = true };
  }, []);

  const getMessages = async (pb: PocketBase) => {
    const results = await pb.collection('messages').getFullList();
    for (let result of results) {
      const username = (await pb.collection('users').getOne(result.user)).username;
      result.username = username;
    }
    setMessages(results.map(r => { return { id: r.id, content: r.content, username: r.username } }));
    return results;
  };

  const createUser = async (pb: PocketBase) => {
    const username = generate() as string;
    setUsername(username);
    const user = await pb.collection('users').create({ username });
  };

  const sendMessage = async () => {
    console.log(input);
  }

  return (
    <div className="container">
      <div className="overflow-auto">
        {messages?.map(message =>
          <div
            className="m-10 p-10 border-solid border-2 border-indigo-600 rounded-lg"
            key={message.id}>
            <small>{message.username}</small>
            <p>{message.content}</p>

          </div>)}
      </div>
      <div className="flex m-10 absolute inset-x-0 bottom-0">
        <input
          onChange={e => setInput(e.currentTarget.value)}
          type="text"
          className="w-full rounded-lg border-0 py-1.5 pl-5 pr-20 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
        />
        <button className="ml-5" onClick={sendMessage}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </button>

      </div>
    </div>
  );
}
