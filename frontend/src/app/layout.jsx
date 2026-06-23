"use client";
import "./globals.css";
import { useState, useEffect, createContext, useContext } from "react";
import Navbar from "../components/Navbar";

// ── Auth Context ──────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export default function RootLayout({ children }) {
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("bb_token");
    const storedUser = localStorage.getItem("bb_user");
    if (stored && storedUser) {
      setToken(stored);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  function login(token, user) {
    setToken(token);
    setUser(user);
    localStorage.setItem("bb_token", token);
    localStorage.setItem("bb_user", JSON.stringify(user));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("bb_token");
    localStorage.removeItem("bb_user");
  }

  return (
    <html lang="en">
      <head>
        <title>Smart Blood Bank System</title>
        <meta name="description" content="Proactive blood inventory management with ML-powered shortage prediction." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🩸</text></svg>" />
      </head>
      <body>
        <AuthContext.Provider value={{ user, token, login, logout }}>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
              {children}
            </main>
            <footer className="text-center py-4 text-xs text-muted border-t border-border">
              Smart Blood Bank System · UEAB Senior Project 2026
            </footer>
          </div>
        </AuthContext.Provider>
      </body>
    </html>
  );
}
