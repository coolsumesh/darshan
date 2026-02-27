"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { authLogin } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Suspense } from "react";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google Sign-In is not configured yet.",
  google_denied:         "Google Sign-In was cancelled.",
  google_token:          "Could not verify Google credentials. Please try again.",
  google_userinfo:       "Could not retrieve Google account info. Please try again.",
  google_no_email:       "Your Google account has no email address.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm animate-pulse" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const oauthError   = searchParams.get("error");

  const [email,    setEmail]    = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd,  setShowPwd]  = React.useState(false);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState(
    oauthError ? (GOOGLE_ERROR_MESSAGES[oauthError] ?? "Sign-in failed. Please try again.") : ""
  );

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

  const googleHref = "/api/backend/api/v1/auth/google";

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

      {/* Google SSO */}
      <a
        href={googleHref}
        className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:border-zinc-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
      >
        {/* Google G logo */}
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </a>

      {/* Divider */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        <span className="text-xs text-zinc-400">or</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>

      {/* Email / password form */}
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
