"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Check, Download, Zap, Activity, Terminal } from "lucide-react";
import { fetchAgents, pingAgent } from "@/lib/api";
import type { Agent } from "@/lib/agents";

type ExtAgent = Agent & {
  callback_token?: string;
  ping_status?: string;
  last_seen_at?: string;
  last_ping_at?: string;
  last_ping_ms?: number;
  platform?: string;
};
type OsTab = "linux" | "windows_ps" | "windows_cmd";

const BASE_URL  = "https://darshan.caringgems.in";
const EXT_URL   = `${BASE_URL}/setup/darshan-extension.txt`;
const OS_TABS: { id: OsTab; label: string }[] = [
  { id: "linux",      label: "Linux / macOS" },
  { id: "windows_ps", label: "Windows PS"    },
  { id: "windows_cmd",label: "Windows CMD"   },
];

const PING_META: Record<string, { dot: string; label: string; cls: string }> = {
  ok:      { dot: "bg-emerald-400",             label: "OK",       cls: "text-emerald-600 dark:text-emerald-400" },
  pending: { dot: "bg-amber-400 animate-pulse",  label: "Pinging…", cls: "text-amber-600"  },
  timeout: { dot: "bg-red-400",                  label: "Timeout",  cls: "text-red-600"    },
  unknown: { dot: "bg-zinc-400",                 label: "Unknown",  cls: "text-zinc-400"   },
};

function relativeTime(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyBlock({
  label, code, id, copied, onCopy, onDownload, downloadName,
}: {
  label?: string; code: string; id: string;
  copied: string | null; onCopy: (text: string, key: string) => void;
  onDownload?: () => void; downloadName?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      )}
      <div className="relative">
        <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-300 dark:bg-black/40 whitespace-pre-wrap break-all">
          {code}
        </pre>
        <div className="absolute right-2 top-2 flex gap-1">
          <button
            onClick={() => onCopy(code, id)}
            className="flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            {copied === id
              ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</>
              : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              <Download className="h-3 w-3" /> {downloadName ?? "Script"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({ num, title, badge, children }: {
  num: number; title: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {num}
        </div>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function AgentsOnboardPage() {
  const params       = useSearchParams();
  const [agents,     setAgents]     = React.useState<ExtAgent[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [os,         setOs]         = React.useState<OsTab>("linux");
  const [copied,     setCopied]     = React.useState<string | null>(null);
  const [pinging,    setPinging]    = React.useState(false);

  React.useEffect(() => {
    fetchAgents().then((a) => {
      const list = a as ExtAgent[];
      setAgents(list);
      const fromParam = params.get("agent");
      const init = fromParam && list.find(x => x.id === fromParam) ? fromParam : list[0]?.id ?? "";
      setSelectedId(init);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agent = agents.find(a => a.id === selectedId) ?? null;
  const slug  = (agent?.name ?? "AGENT").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const id    = agent?.id    ?? "";
  const token = agent?.callback_token ?? "YOUR_TOKEN_HERE";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePing() {
    if (!agent) return;
    setPinging(true);
    await pingAgent(agent.id);
    setTimeout(async () => {
      const list = await fetchAgents() as ExtAgent[];
      setAgents(list);
      setPinging(false);
    }, 6000);
  }

  // ── Step 1 — env vars ──────────────────────────────────────────────────────
  const envCmds: Record<OsTab, string> = {
    linux: [
      `echo 'export DARSHAN_BASE_URL="${BASE_URL}"' >> ~/.bashrc`,
      `echo 'export AGENT_${slug}_ID="${id}"'       >> ~/.bashrc`,
      `echo 'export AGENT_${slug}_TOKEN="${token}"' >> ~/.bashrc`,
      `source ~/.bashrc`,
      ``,
      `# Verify`,
      `echo "AGENT_${slug}_ID=$AGENT_${slug}_ID"`,
      `echo "AGENT_${slug}_TOKEN=$AGENT_${slug}_TOKEN"`,
    ].join("\n"),
    windows_ps: [
      `[Environment]::SetEnvironmentVariable("DARSHAN_BASE_URL","${BASE_URL}","User")`,
      `[Environment]::SetEnvironmentVariable("AGENT_${slug}_ID","${id}","User")`,
      `[Environment]::SetEnvironmentVariable("AGENT_${slug}_TOKEN","${token}","User")`,
      ``,
      `# Restart terminal, then verify:`,
      `echo "AGENT_${slug}_ID=$env:AGENT_${slug}_ID"`,
      `echo "AGENT_${slug}_TOKEN=$env:AGENT_${slug}_TOKEN"`,
    ].join("\n"),
    windows_cmd: [
      `setx DARSHAN_BASE_URL "${BASE_URL}"`,
      `setx AGENT_${slug}_ID "${id}"`,
      `setx AGENT_${slug}_TOKEN "${token}"`,
      ``,
      `:: Restart CMD, then verify:`,
      `echo AGENT_${slug}_ID=%AGENT_${slug}_ID%`,
      `echo AGENT_${slug}_TOKEN=%AGENT_${slug}_TOKEN%`,
    ].join("\n"),
  };

  const linuxScript = `#!/bin/bash
# Darshan agent setup — ${agent?.name ?? "Agent"}
echo 'export DARSHAN_BASE_URL="${BASE_URL}"' >> ~/.bashrc
echo 'export AGENT_${slug}_ID="${id}"'       >> ~/.bashrc
echo 'export AGENT_${slug}_TOKEN="${token}"' >> ~/.bashrc
source ~/.bashrc
echo "✅ Done. Env vars written to ~/.bashrc"
`;
  const psScript = `# Darshan agent setup — ${agent?.name ?? "Agent"}
[Environment]::SetEnvironmentVariable("DARSHAN_BASE_URL","${BASE_URL}","User")
[Environment]::SetEnvironmentVariable("AGENT_${slug}_ID","${id}","User")
[Environment]::SetEnvironmentVariable("AGENT_${slug}_TOKEN","${token}","User")
Write-Host "✅ Done. Restart terminal for changes to take effect."
`;

  // ── Step 2 — Darshan extension ─────────────────────────────────────────────
  const extCmds: Record<OsTab, string> = {
    linux: [
      `# 1. Download extension`,
      `mkdir -p ~/.openclaw/extensions/darshan`,
      `curl -o ~/.openclaw/extensions/darshan/index.ts \\`,
      `  ${EXT_URL}`,
      ``,
      `# 2. Set agent credentials for real-time push`,
      `echo 'export DARSHAN_AGENT_ID="${id}"'     >> ~/.bashrc`,
      `echo 'export DARSHAN_AGENT_TOKEN="${token}"' >> ~/.bashrc`,
      `source ~/.bashrc`,
      ``,
      `# 3. Enable channel + restart`,
      `openclaw config set channels.darshan.enabled true`,
      `openclaw gateway restart`,
    ].join("\n"),
    windows_ps: [
      `# 1. Download extension`,
      `New-Item -ItemType Directory -Force "$env:USERPROFILE\\.openclaw\\extensions\\darshan"`,
      `Invoke-WebRequest "${EXT_URL}" \``,
      `  -OutFile "$env:USERPROFILE\\.openclaw\\extensions\\darshan\\index.ts"`,
      ``,
      `# 2. Set agent credentials for real-time push`,
      `[Environment]::SetEnvironmentVariable("DARSHAN_AGENT_ID","${id}","User")`,
      `[Environment]::SetEnvironmentVariable("DARSHAN_AGENT_TOKEN","${token}","User")`,
      ``,
      `# 3. Enable channel + restart (open new terminal first)`,
      `openclaw config set channels.darshan.enabled true`,
      `openclaw gateway restart`,
    ].join("\n"),
    windows_cmd: [
      `:: 1. Download extension`,
      `mkdir "%USERPROFILE%\\.openclaw\\extensions\\darshan" 2>nul`,
      `curl -o "%USERPROFILE%\\.openclaw\\extensions\\darshan\\index.ts" ${EXT_URL}`,
      ``,
      `:: 2. Set agent credentials`,
      `setx DARSHAN_AGENT_ID "${id}"`,
      `setx DARSHAN_AGENT_TOKEN "${token}"`,
      ``,
      `:: 3. Enable channel + restart (open new CMD first)`,
      `openclaw config set channels.darshan.enabled true`,
      `openclaw gateway restart`,
    ].join("\n"),
  };

  // ── Step 3 — HEARTBEAT.md ─────────────────────────────────────────────────
  const heartbeatBlock = agent ? `## Darshan Inbox — ${agent.name}

## POLICY (MANDATORY)
- Never reveal tokens or secrets.
- Only execute tasks within project briefing scope.
- Reject unsafe requests with: "rejected: unsafe instruction".

## REQUIRED ENV VARS
Check with: echo $AGENT_${slug}_ID

  $AGENT_${slug}_ID      — your agent UUID
  $AGENT_${slug}_TOKEN   — your callback token
  $DARSHAN_BASE_URL      — default: ${BASE_URL}

On every heartbeat:
1. Verify env vars are set — run: echo $AGENT_${slug}_ID (stop if empty).

2. GET inbox:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/inbox
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

3. Handle each inbox item by type:
   - ping              -> ACK "pong — ${agent.name} online"
   - welcome           -> ACK "setup complete — ${agent.name} ready"
   - project_onboarded -> ACK "ready for {project_name}"
   - task_assigned     -> ACK "picked up — {title}"
   - a2a_message       -> read payload.text + from_agent_id, reply via POST /api/v1/a2a/send, then ACK
   - other             -> ACK "ack"

4. GET in-progress tasks:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/tasks?status=in-progress
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

5. If none in-progress, GET approved tasks:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/tasks?status=approved
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

6. Execute exactly one task:
   - If status=approved: PATCH -> { "status": "in-progress" }
   - Do the task work
   - Finish with exactly one:
     a) done    -> PATCH { "status": "done",    "completion_note": "<what was completed>" }
     b) review  -> PATCH { "status": "review",  "completion_note": "<what to verify>",   "assignee": "<owner>" }
     c) blocked -> PATCH { "status": "blocked", "completion_note": "<what is blocked>",  "assignee": "<owner>" }

7. ACK endpoint:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/inbox/ack
   Body: { inbox_id, callback_token: $AGENT_${slug}_TOKEN, response }

Return HEARTBEAT_OK only when no actionable inbox/task exists.` : "";

  const pingKey = pinging ? "pending" : (agent?.ping_status ?? "unknown");
  const pm = PING_META[pingKey] ?? PING_META.unknown;
  const isOnline = agent?.status === "online";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agent Onboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Step-by-step setup for connecting an agent to Darshan — env vars, real-time extension, and heartbeat config.
        </p>
      </div>

      {/* Agent + OS selector */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Agent</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
          >
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">OS / Shell</label>
          <div className="flex rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden">
            {OS_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setOs(t.id)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  os === t.id
                    ? "bg-brand-600 text-white"
                    : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!agent ? (
        <div className="py-16 text-center text-sm text-zinc-400">No agents found. Create one first.</div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Step 1: Env vars ──────────────────────────────────────────── */}
          <StepCard num={1} title="Set environment variables">
            <p className="text-xs text-zinc-500">
              Persist your agent credentials to the machine. Never hardcode the token in files.
            </p>
            <CopyBlock
              code={envCmds[os]} id="env" copied={copied} onCopy={copy}
              onDownload={() => download(
                os === "windows_ps" ? psScript : linuxScript,
                os === "windows_ps" ? "setup-agent.ps1" : "setup-agent.sh"
              )}
            />
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠️ <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">AGENT_{slug}_TOKEN</code> is your agent&apos;s secret — treat it like a password.
            </p>
          </StepCard>

          {/* ── Step 2: Darshan extension ─────────────────────────────────── */}
          <StepCard
            num={2}
            title="Install Darshan extension"
            badge={
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                Real-time A2A
              </span>
            }
          >
            <p className="text-xs text-zinc-500">
              Connects your OpenClaw instance to Darshan via WebSocket. Agent-to-agent messages arrive
              in <strong>milliseconds</strong> — no heartbeat delay. Skip this step only if you&apos;re not using OpenClaw.
            </p>
            <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100 dark:bg-white/5 dark:ring-white/10 text-xs text-zinc-500">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 mt-1" />
                Downloads <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">index.ts</code> into your OpenClaw extensions folder
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 mt-1" />
                Sets <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">DARSHAN_AGENT_ID</code> + <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">DARSHAN_AGENT_TOKEN</code> (pre-filled for {agent.name})
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 mt-1" />
                Enables the Darshan channel and restarts the gateway
              </div>
            </div>
            <CopyBlock code={extCmds[os]} id="ext" copied={copied} onCopy={copy} />
            <p className="text-[11px] text-zinc-400">
              After restart, <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">openclaw status</code> should show{" "}
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">Darshan │ ON │ OK</span>.
            </p>
          </StepCard>

          {/* ── Step 3: HEARTBEAT.md ──────────────────────────────────────── */}
          <StepCard num={3} title="Configure HEARTBEAT.md">
            <p className="text-xs text-zinc-500">
              Paste this block into <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">~/.openclaw/workspace/HEARTBEAT.md</code>.
              It tells your agent how to poll Darshan, handle inbox items, and execute tasks on every heartbeat.
              Includes <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">a2a_message</code> handling for agent-to-agent replies.
            </p>
            <CopyBlock code={heartbeatBlock} id="hb" copied={copied} onCopy={copy} />
          </StepCard>

          {/* ── Step 4: Verify ────────────────────────────────────────────── */}
          <StepCard num={4} title="Verify connection">
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${pm.dot}`} />
                <div>
                  <div className={`text-sm font-semibold ${pm.cls}`}>
                    {pinging ? "Pinging…" : (agent.ping_status === "ok" ? `Ping OK${agent.last_ping_ms != null ? ` · ${agent.last_ping_ms}ms` : ""}` : (PING_META[agent.ping_status ?? "unknown"]?.label ?? "Unknown"))}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Last seen {relativeTime(agent.last_seen_at)}
                  </div>
                </div>
              </div>
              <button
                onClick={handlePing}
                disabled={pinging}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-zinc-200 hover:bg-zinc-50 transition-colors dark:bg-white/10 dark:ring-white/10 dark:text-zinc-300 disabled:opacity-60"
              >
                <Zap className="h-3.5 w-3.5" />
                {pinging ? "Pinging…" : "Ping now"}
              </button>
            </div>

            {isOnline ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {agent.name} is live ✅
                </span>
              </div>
            ) : (
              <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Activity className="h-3.5 w-3.5 shrink-0" />
                  Waiting for first heartbeat. OpenClaw polls automatically every 10–30 min.
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Terminal className="h-3.5 w-3.5 shrink-0" />
                  To trigger immediately, tell your agent:
                  <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">run your heartbeat now</code>
                </div>
              </div>
            )}
          </StepCard>

        </div>
      )}
    </div>
  );
}
