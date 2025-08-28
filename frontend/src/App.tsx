import React, { useEffect, useState } from "react";
import AuthScreen from "./AuthScreen";
import ChatUI from "./ChatUI";

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("chatbook_token"));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("chatbook_username"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("chatbook_token", token);
    } else {
      localStorage.removeItem("chatbook_token");
    }
  }, [token]);

  useEffect(() => {
    if (username) {
      localStorage.setItem("chatbook_username", username);
    } else {
      localStorage.removeItem("chatbook_username");
    }
  }, [username]);

  if (!token) {
    return (
      <AuthScreen
        onAuth={(jwt: string, user?: string) => {
          setToken(jwt);
          if (user) setUsername(user);
        }}
      />
    );
  }

  if (!username) {
    // If there's a token but no username in state, try reading stored username
    const stored = localStorage.getItem("chatbook_username");
    if (stored) setUsername(stored);
    return <div>Loading...</div>;
  }

  return <ChatUI username={username} />;
}

export default App;
