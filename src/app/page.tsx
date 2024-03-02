'use client'

import { useState, useEffect, useRef } from "react";
import PocketBase from 'pocketbase';
import { generate } from "random-words";

type Message = {
  id: string;
  content: string;
  username: string;
  time: string;
}

type User = {
  id: string;
  username: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>();
  const [user, setUser] = useState<User>();
  const [input, setInput] = useState("");

  const effectRan = useRef(false);

  useEffect(() => {
    if (!effectRan.current) {
      const pb = new PocketBase("http://127.0.0.1:8090");
      pb.admins.authWithPassword("lyne8278@gmail.com", "123123123123")
      createUser(pb);
      getMessages(pb);
      subscribeMessages(pb);
    }
    return () => { effectRan.current = true };
  }, []);

  const getMessages = async (pb: PocketBase) => {
    const results = await pb.collection('messages').getFullList();
    for (let result of results) {
      const username = (await pb.collection('users').getOne(result.user)).username;
      result.username = username;
    }
    setMessages(results.map(r => { return { id: r.id, content: r.content, username: r.username, time: r.created } }));
  };

  const subscribeMessages = async (pb: PocketBase) => {
    await pb.collection('messages').subscribe("*", async e => {
      await getMessages(pb);
    })
  }

  const createUser = async (pb: PocketBase) => {
    const username = generate() as string;
    const user = await pb.collection('users').create({ username });
    setUser({ id: user.id, username: user.username });
    // setUser({ id: 'w3iacyzlhlickra', username: 'mad' });
  };

  const sendMessage = async () => {
    const pb = new PocketBase("http://127.0.0.1:8090");
    const result = await pb.collection('messages').create({ content: input, user: user?.id });
    setInput("");
  }

  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages])

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="bg-gray-800 text-white p-8">
        <p>A</p>
      </div>

      {/* Primary Flex Container for Input + Response */}
      <div className="flex flex-col w-full bg-gray-100">
        {/* Overflow Container for Message Fetching */}
        <div className="flex-grow overflow-scroll bg-blue-100" style={{ height: "85vh", overflowX: "auto" }}>
          {messages?.map(message =>
            <div
              className={message.username == user?.username ? "flex justify-end mx-10 my-5" : "flex mx-10 my-5"}
              key={message.id}>
              <div className="p-3 border-solid border-2 border-indigo-600 rounded-lg bg-indigo-600 text-white">
                <div className="flex items-center">
                  <div className="font-bold text-lg mr-2">{message.username}
                  </div>
                  <div className="text-sm text-grey">{message.time.slice(10, 16)}</div>
                </div>
                <div>{message.content}</div>
              </div>
            </div>)}
          <div ref={messagesEndRef}></div>
        </div>

        {/* Flex Container for Message Input */}
        <div className="flex m-2 p-4 mt-auto bg-red-100">
          <input
            onChange={e => setInput(e.currentTarget.value)}
            onKeyDown={e => {
              e.key == "Enter" && sendMessage();
            }}
            value={input}
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
    </div>
  );
}
