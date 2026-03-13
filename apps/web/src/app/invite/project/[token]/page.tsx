"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { authMe } from "@/lib/api";

export default function InviteLandingPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");

  React.useEffect(() => {
    if (!token) return;
    authMe().then((user) => {
      if (user) {
        // Logged in — go to dashboard, notification bell will show the invite
        router.replace(`/dashboard?invite=${encodeURIComponent(token)}`);
      } else {
        // Not logged in — go to login, come back here after
        router.replace(`/login?next=${encodeURIComponent(`/invite/project/${token}`)}`);
      }
    });
  }, [token, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-zinc-500">Loading invite…</p>
      </div>
    </div>
  );
}
