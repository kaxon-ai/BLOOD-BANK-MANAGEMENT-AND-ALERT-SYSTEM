"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets, Loader2 } from "lucide-react";
import { useAuth } from "../layout";
import { auth } from "../../lib/api";

export default function LoginPage() {
  const { login } = useAuth() || {};
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await auth.login({ email, password });
      login(data.token, data.user);
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="card w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Droplets className="w-7 h-7 text-crimson" />
          <span className="font-bold text-lg">
            Smart<span className="text-crimson">Blood</span>Bank
          </span>
        </div>

        <h1 className="text-xl font-bold mb-1 text-center">Staff Sign In</h1>
        <p className="text-sm text-muted text-center mb-6">
          Enter your credentials to access the dashboard.
        </p>

        {error && (
          <div className="text-sm text-crimson bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="admin@bloodbank.ke"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-muted text-center mt-6">
          Default: <code className="text-text-dim">admin@bloodbank.ke</code> / <code className="text-text-dim">admin1234</code>
        </p>
      </div>
    </div>
  );
}
