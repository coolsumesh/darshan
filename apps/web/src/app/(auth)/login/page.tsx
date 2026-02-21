"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { authLogin } from "@/lib/api";
import { cn } from "@/lib/cn";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd,  setShowPwd]  = React.useState(false);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    setError("");
    const user = await authLogin(email.trim(), password);
    if (user) {
      router.replace("/dashboard");
    } else {
      setError("Invalid email or password. Please try again.");
      setLoading(false);
    }
  }

  const inp = cn(
    "w-full rounded-xl border-0 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 ring-1 ring-zinc-200",
    "placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40",
    "dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-zinc-500"
  );

  return (
    <div className="w-full max-w-sm">
      {/* Logo / brand */}
      <div className="mb-8 text-center">
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-2xl font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)" }}
        >
          D
        </div>
        <h1 className="font-display text-2xl font-extrabold text-zinc-900 dark:text-white">Darshan</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to your workspace</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Email</label>
          <input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@mithranLabs.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            className={inp}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Password</label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className={cn(inp, "pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
          style={{ backgroundColor: "#7C3AED" }}
        >
          <LogIn className="h-4 w-4" />
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-zinc-400">
        Darshan · MithranLabs internal workspace
      </p>
    </div>
  );
}
