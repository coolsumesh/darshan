"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authMe } from "@/lib/api";

export default function InviteLandingPage(props: { params: Promise<{ token: string }> }) {
  const params = React.use(props.params);
  const router = useRouter();

  React.useEffect(() => {
    authMe().then((user) => {
      if (user) {
        // Logged in — go to dashboard, notification bell will show the invite
        router.replace(`/dashboard?invite=${params.token}`);
      } else {
        // Not logged in — go to login, come back here after
        router.replace(`/login?next=/invite/project/${params.token}`);
      }
    });
  }, [params.token, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-zinc-500">Loading invite…</p>
      </div>
    </div>
  );
}
