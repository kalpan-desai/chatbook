import React, { useState } from "react";
import axios from "axios";

// Use VITE_API_URL if provided; otherwise default to the host serving the page with backend port 8000
const DEFAULT_BACKEND_PORT = 8000;
const envApi = import.meta.env.VITE_API_URL as string | undefined;
const API_URL = envApi || `${window.location.protocol}//${window.location.hostname}:${DEFAULT_BACKEND_PORT}`;

const initialForm = { username: "", password: "" };

export default function AuthScreen({ onAuth }: { onAuth: (token: string, username?: string) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!form.username.trim() || !form.password.trim()) {
      setError("Username and password are required.");
      return false;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        const res = await axios.post(
          `${API_URL}/login`,
          new URLSearchParams({ username: form.username, password: form.password }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        onAuth(res.data.access_token, form.username);
      } else {
        await axios.post(`${API_URL}/register`, form);
        setIsLogin(true);
        setError("Registration successful! Please log in.");
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
        (isLogin ? "Login failed." : "Registration failed.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ece5dd" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          minWidth: 320,
        }}
      >
        <h2 style={{ textAlign: "center", color: "#075e54" }}>
          {isLogin ? "Login to ChatBook" : "Register for ChatBook"}
        </h2>
        <div style={{ margin: "16px 0" }}>
          <input
            name="username"
            placeholder="Username"
            value={form.username}
            onChange={handleChange}
            style={{ width: "100%", padding: 10, borderRadius: 4, border: "1px solid #ccc" }}
            autoComplete="username"
          />
        </div>
        <div style={{ margin: "16px 0" }}>
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            style={{ width: "100%", padding: 10, borderRadius: 4, border: "1px solid #ccc" }}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </div>
        {error && <div style={{ color: "#d32f2f", marginBottom: 12 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#25d366",
            color: "#fff",
            border: "none",
            padding: 12,
            borderRadius: 4,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 8,
          }}
        >
          {loading ? (isLogin ? "Logging in..." : "Registering...") : isLogin ? "Login" : "Register"}
        </button>
        <div style={{ textAlign: "center" }}>
          <span style={{ color: "#555" }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#075e54",
              fontWeight: 600,
              marginLeft: 8,
              cursor: "pointer",
            }}
          >
            {isLogin ? "Register" : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}
