import { APP_NAME } from "@darshan/shared";

async function getHealth() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false } as const;
    return (await res.json()) as { ok: boolean; service?: string; time?: string };
  } catch {
    return { ok: false } as const;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>{APP_NAME}</h1>
      <p>MVP dashboard scaffold.</p>
      <h2>API health</h2>
      <pre>{JSON.stringify(health, null, 2)}</pre>
    </main>
  );
}
