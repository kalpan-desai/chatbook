import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

const DEFAULT_BACKEND_PORT = 8000;
const envApi = import.meta.env.VITE_API_URL as string | undefined;
const API_URL = envApi || `${window.location.protocol}//${window.location.hostname}:${DEFAULT_BACKEND_PORT}`;
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws/chat/";

// Message status icons
const statusIcons: Record<string, string> = {
  sent: "✔️",
  delivered: "✔✔️",
  seen: "👁️",
};

interface Message {
  id: number;
  from: string;
  to: string;
  content: string;
  status: string;
  timestamp: string;
}

interface Contact {
  username: string;
}

interface ChatUIProps {
  username: string;
}

export default function ChatUI({ username }: ChatUIProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const activeContactRef = useRef<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const ws = useRef<WebSocket | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // keep ref in sync
  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  // Fetch contacts from backend
  useEffect(() => {
    axios.get(`${API_URL}/users`)
      .then(res => {
        const filtered = res.data.filter((c: Contact) => c.username !== username);
        setContacts(filtered);
        if (!activeContact && filtered.length > 0) setActiveContact(filtered[0]);
      })
      .catch(() => setContacts([]));
    // eslint-disable-next-line
  }, [username]);

  // Fetch chat history when activeContact changes; merge with existing messages
  useEffect(() => {
    if (!activeContact) return;
    axios.get(`${API_URL}/messages?user1=${username}&user2=${activeContact.username}`)
      .then(res => {
        // Merge history with messages received via websocket (avoid duplicates by id)
        const history: Message[] = res.data || [];
        setMessages((prev) => {
          const map = new Map<number, Message>();
          prev.forEach(m => map.set(m.id, m));
          history.forEach(m => map.set(m.id, m));
          // sort by timestamp
          return Array.from(map.values()).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      })
      .catch(() => {});
  }, [activeContact, username]);

  // Connect WebSocket ONCE per username (not per contact)
  useEffect(() => {
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.close();
    }
    const socket = new WebSocket(`${WS_URL}${username}`);
    ws.current = socket;
    socket.onopen = () => {};
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) return;
      // Normalize from/to
      const msgFrom = data.from ?? username; // if missing, treat as me (confirmation)
      const msgTo = data.to ?? username; // if missing, treat as me (recipient)

      // Build message object
      const incoming: Message = {
        id: data.id,
        from: msgFrom,
        to: msgTo,
        content: data.content,
        status: data.status,
        timestamp: data.timestamp,
      };

      // Append if not already present
      setMessages((prev) => {
        if (prev.some(m => m.id === incoming.id)) return prev;
        const merged = [...prev, incoming].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return merged;
      });

      // If it belongs to the currently active chat, scroll to bottom
      const active = activeContactRef.current;
      if (active && ((incoming.from === active.username && incoming.to === username) || (incoming.from === username && incoming.to === active.username))) {
        // small timeout to let React render
        setTimeout(() => chatAreaRef.current?.scrollTo(0, chatAreaRef.current.scrollHeight), 50);
      }
    };
    socket.onclose = () => {};
    return () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    };
    // Only depend on username
  }, [username]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatAreaRef.current?.scrollTo(0, chatAreaRef.current.scrollHeight);
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !ws.current || !activeContact) return;
    ws.current.send(
      JSON.stringify({ to: activeContact.username, content: input })
    );
    setInput("");
  };

  return (
    <div style={{ display: "flex", height: "90vh", background: "#ece5dd", borderRadius: 8, overflow: "hidden" }}>
      {/* Contact List */}
      <div style={{ width: 220, background: "#fff", borderRight: "1px solid #ddd", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 16, fontWeight: 700, color: "#075e54", borderBottom: "1px solid #eee" }}>Contacts</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {contacts.map((c) => (
            <div
              key={c.username}
              onClick={() => setActiveContact(c)}
              style={{
                padding: 16,
                cursor: "pointer",
                background: activeContact?.username === c.username ? "#e0f2f1" : undefined,
                borderBottom: "1px solid #f5f5f5",
                color: "#333",
              }}
            >
              {c.username}
            </div>
          ))}
        </div>
      </div>
      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fafafa" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #eee", color: "#075e54", fontWeight: 600 }}>
          {activeContact?.username ? `Chat with ${activeContact.username}` : "Select a contact"}
        </div>
        <div
          ref={chatAreaRef}
          style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
        >
          {messages
            .filter(
              (m) =>
                (m.from === username && m.to === activeContact?.username) ||
                (m.from === activeContact?.username && m.to === username)
            )
            .map((m) => (
              <div
                key={m.id + m.timestamp}
                style={{
                  alignSelf: m.from === username ? "flex-end" : "flex-start",
                  background: m.from === username ? "#dcf8c6" : "#fff",
                  padding: 10,
                  borderRadius: 8,
                  maxWidth: 320,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 15 }}>{m.content}</div>
                <div style={{ fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{statusIcons[m.status] || ""}</span>
                </div>
              </div>
            ))}
        </div>
        {/* Message Input */}
        <form
          onSubmit={e => {
            e.preventDefault();
            sendMessage();
          }}
          style={{ display: "flex", padding: 16, borderTop: "1px solid #eee", background: "#fff" }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            style={{ flex: 1, padding: 10, borderRadius: 20, border: "1px solid #ccc", outline: "none" }}
            autoFocus
          />
          <button
            type="submit"
            style={{ marginLeft: 12, background: "#25d366", color: "#fff", border: "none", borderRadius: 20, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
