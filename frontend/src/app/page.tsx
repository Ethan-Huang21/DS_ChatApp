'use client'

import { useState, useEffect, useRef } from "react";

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
  const [open, setOpen] = useState(false);
  const ddmenuRef = useRef<HTMLDivElement>(null);

  const effectRan = useRef(false);

  // addresses of load balancers.
  const loadBalancerAdresses = ['ws://10.13.101.26:3010', 'ws://10.13.101.26:3011']

  let ws = useRef<WebSocket | null>(null);

  const sendMessage = () => {
    let message = {
      user: user?.id,
      content: input
    }
    let messageObject = JSON.stringify(message);
    console.log(messageObject)

    try {
      if (ws.current === null) {
        console.log("Error sending messaage, websocket connection not open.")
      }
      else ws.current.send(messageObject);
    }
    catch {
      console.log("Message failed to send.");
    }
    setInput("");
  }

  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages])

  const openWebSocket = (serverAddress: string, loadBalancerIndex: number) => {
    // Create a WebSocket connection when the component mounts
    ws.current = new WebSocket(serverAddress);

    // Handle messages from the server
    ws.current.addEventListener('message', (event) => {
      const receivedData = event.data;

      try {
        // Parse the received string into a JavaScript object
        const data = JSON.parse(receivedData);
        console.log('Received messages:', data);

        // If user 
        if (data.collectionName && data.collectionName == "users") {
          const user = {
            id: data.id,
            username: data.username
          };
          setUser(user);
        }

        // If message list
        else {
          setMessages(data);
        }
      } catch (error) {
        console.error('Error parsing received data:', error);
      }
    });

    // Handle disconnection
    ws.current.addEventListener('close', () => {
      console.log('Connection closed');
      // server died so connect to next available load balancer
      if (loadBalancerAdresses[loadBalancerIndex + 1] !== null) openWebSocket(loadBalancerAdresses[loadBalancerIndex + 1], loadBalancerIndex + 1);
    });

    return () => {
      // Close the WebSocket connection when the component unmounts
      if (ws.current !== null) {
        ws.current.close();
        if (loadBalancerAdresses[loadBalancerIndex + 1] !== null) openWebSocket(loadBalancerAdresses[loadBalancerIndex + 1], loadBalancerIndex + 1);
      }
    };
  }
  // connect to load balancer
  useEffect(() => {
    if (!effectRan.current) {
      openWebSocket(loadBalancerAdresses[0], 0);
    }

    return () => {
      effectRan.current = true
    }
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="bg-gray-800 text-white p-4" style={{ width: "80px", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        {/* First Button is for Profile Dropdown-Menu */}
        <div className='menu-container' style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <button className='menu-trigger relative overflow-hidden focus:outline-none focus:ring rounded-full border-blue-500 mb-2'
            style={{ width: "56px", height: "56px" }}
            onClick={() => { setOpen(!open) }}>
            <div className="w-13 h-13 rounded-full overflow-hidden">
              <img
                src="/phimg1.png"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
          </button>
          {/* Dropdown Menu */}
          {open &&
            <div className={`absolute top-10 left-5 mt-10 bg-white border rounded-md shadow-lg text-black transition-opacity duration-350`}
              style={{ width: '150px', padding: '10px 20px', pointerEvents: open ? 'auto' : 'none' }}
              ref={ddmenuRef}>
              <div className='text-lg mb-1'>{user?.username}</div>
              <hr className="my-1" style={{ color: "gray", background: "gray", height: "2px", width: "75px" }} />
              <div className="ml-1 my-1">
                {/* Dropdown Items --> Can change depending on authentication */}
                <div className="hover:text-gray-700"> Select1 </div>
                <div className="hover:text-gray-700"> Select2 </div>
                <div className="hover:text-gray-700"> Select3 </div>
                <div className="hover:text-gray-700"> Select4 </div>
                <div className="hover:text-gray-700"> Select5 </div>
              </div>
            </div>
          }
        </div>
        <hr className="my-1" style={{ color: "gray", background: "gray", height: "2px", width: "40px" }} />
        {/* Other Buttons for Servers */}
      </div>

      {/* Primary Flex Container for Input + Response */}
      <div className="flex flex-col w-full bg-gray-100">
        {/* Overflow Container for Message Fetching bg-blue-100*/}
        <div className="flex-grow overflow-scroll" style={{ height: "85vh", overflowX: "auto" }}>
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
                <div className="break-words" style={{ maxWidth: "350px" }}>{message.content}</div>
              </div>
            </div>)}
          <div ref={messagesEndRef}></div>
        </div>

        {/* Flex Container for Message Input bg-red-100*/}
        <div className="flex m-2 p-4 mt-auto">
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
