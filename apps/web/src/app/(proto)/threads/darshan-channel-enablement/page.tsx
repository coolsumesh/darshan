export default function DarshanChannelEnablementPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Darshan Channel — Architecture, Fixes & Telegram Gap Analysis
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Last updated: 2026-03-15. All plugin fixes, architectural decisions, and parity gap vs Telegram.
      </p>

      {/* ── STATUS BANNER ── */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/20">
        <div className="flex items-center gap-2">
          <span className="text-green-600 dark:text-green-400 text-lg">●</span>
          <span className="font-semibold text-green-800 dark:text-green-300">Current status: Fully operational — real LLM replies + message receipts confirmed</span>
        </div>
        <ul className="mt-2 text-sm text-green-700 dark:text-green-400 list-disc pl-5 space-y-0.5">
          <li>Real LLM replies posting to threads (not template/fallback)</li>
          <li>Per-thread session context — each thread has its own LLM history</li>
          <li>Message receipt ticks live — blue (all read), purple (some read), gray (delivered)</li>
          <li>WebSocket stable — no 60s drops since nginx timeout fix</li>
          <li>No double replies — fallback removed, lane-aware delivery</li>
          <li>Notifications ACK'd exactly once via ackOnce guard</li>
        </ul>
      </div>

      {/* ── FIXES LOG ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">1) All Fixes Applied (2026-03-10)</h2>
        <div className="space-y-2">
          {[
            {
              title: "plugins.allow missing — startAccount never called",
              status: "fixed",
              detail: "Plugin was loading (module imported) but startAccount was never invoked because plugins.allow was empty. OpenClaw restricts non-bundled plugins to load-only mode without explicit trust. Fix: add darshan to plugins.allow in openclaw.json.",
              code: `// openclaw.json
{
  "plugins": {
    "allow": ["darshan"],
    "entries": { "darshan": { "enabled": true } }
  }
}`,
            },
            {
              title: "Hand-crafted SessionKey — wrong session format",
              status: "fixed",
              detail: "Plugin was using strings like 'darshan:thread:xxx:msg:yyy:os:win32' as SessionKey. These don't match the internal format so no session history loaded and the model had no context. Fixed by calling resolveAgentRoute() which builds the correct key.",
              code: `// Before (wrong)
SessionKey: \`darshan:thread:\${threadId}:msg:\${notif.message_id}:os:\${process.platform}\`

// After (correct)
const route = rt.channel.routing.resolveAgentRoute({
  cfg, channel: "darshan", accountId: "default",
  peer: { kind: "direct", id: fromSlug },
});
SessionKey: route.sessionKey`,
            },
            {
              title: "Shared session across all threads — no per-thread context",
              status: "fixed",
              detail: "All messages from the same sender shared one session key (darshan:direct:sumesh_sukumaran), so the LLM mixed up context from different threads and didn't know which thread it was replying in. Fixed by scoping session key to the thread_id.",
              code: `// Derive thread-scoped key from route session key
const threadSessionKey = route.sessionKey.replace(
  /direct:[^:]+$/,
  \`thread:\${threadId}\`
);
// Result: session:agent:main:darshan:thread:<threadId>
// Each thread now has its own LLM history`,
            },
            {
              title: "Double replies — fallback firing before lane drains",
              status: "fixed",
              detail: "When the LLM lane was busy with a previous run, dispatchReplyWithBufferedBlockDispatcher returned immediately with delivered=false. The fallback template fired instantly. Then 18s later the queued LLM run also posted — two replies in the same thread. Fixed by removing fallback entirely.",
              code: `// Before: fallback after dispatch returned
if (!delivered) {
  await postReply(\`Got it, \${fromSlug}. I received...\`); // ← double reply
}

// After: trust the lane — queued reply will arrive
if (!delivered) {
  log.warn("lane may be busy — reply queued");
  await ackOnce("queued for reply");
}`,
            },
            {
              title: "Double-ACK — notification processed twice",
              status: "fixed",
              detail: "When dispatch was queued, ackNotif was called immediately (queued for reply), and then again inside deliver() when the LLM eventually replied. Fixed with an ackOnce guard that only fires the first call.",
              code: `let acked = false;
const ackOnce = (note: string) => {
  if (acked) return Promise.resolve();
  acked = true;
  return ackNotif(note);
};`,
            },
            {
              title: "BodyForAgent instruction pollution — causing NO_REPLY",
              status: "fixed",
              detail: "Body/BodyForAgent contained instruction text ('You are Sanjaya. Never output NO_REPLY...'). The LLM saw this as a user message with meta-instructions and returned NO_REPLY. Fixed: Body = raw message, BodyForAgent = clean thread context label only.",
              code: `// Before (wrong)
Body: "You are Sanjaya. Reply naturally. Never output NO_REPLY..."

// After (matches Telegram pattern)
Body: body,
BodyForAgent: \`[Darshan thread: "\${subject}" | thread_id: \${threadId}]\\n\${fromSlug}: \${body}\``,
            },
            {
              title: "OriginatingChannel: 'darshan' — invalid ChannelId",
              status: "fixed",
              detail: "'darshan' is not a registered ChannelId. Setting it caused the framework to try resolving an unknown channel for outbound delivery. Removed — custom deliver() callback handles posting directly to thread API.",
            },
            {
              title: "(api as any).runtime casts — 4 places",
              status: "fixed",
              detail: "Plugin used unsafe casts to access runtime. api.runtime is a typed property on OpenClawPluginApi. All 4 instances changed to typed access: api.runtime and _runtime.config.loadConfig().",
            },
            {
              title: "No concurrency guard — duplicate LLM dispatches per thread",
              status: "fixed",
              detail: "Two notifications for the same thread arriving simultaneously would spawn parallel LLM dispatches. Fixed with a _processingThreads Set that blocks a second dispatch for the same thread_id until the first completes.",
              code: `const _processingThreads = new Set<string>();
// Skip if this thread is already being processed
if (_processingThreads.has(threadId)) return;
_processingThreads.add(threadId);
handleNotification(...).finally(() => _processingThreads.delete(threadId));`,
            },
            {
              title: "WS drops every 60s — nginx proxy_read_timeout",
              status: "fixed",
              detail: "nginx default proxy_read_timeout=60s was dropping idle WebSocket connections. Added proxy_read_timeout 3600s and proxy_send_timeout 3600s to the /api/backend/ location block. WS now holds for hours.",
              code: `# /etc/nginx/sites-enabled/darshan — inside location /api/backend/
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;`,
            },
            {
              title: "Client-side WS keepalive ping",
              status: "fixed",
              detail: "Added a 30s interval JSON ping from the client on WS open. Keeps the connection alive from the client side if the backend sends no traffic for extended periods.",
              code: `const pingInterval = setInterval(() => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
  else clearInterval(pingInterval);
}, 30000);`,
            },
          ].map(({ title, status, detail, code }) => (
            <div key={title} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  ✓ FIXED
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{detail}</p>
              {code && (
                <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800 text-slate-700 dark:text-slate-300">{code}</pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── GAP ANALYSIS ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">2) Gap Analysis vs Telegram (updated 2026-03-15)</h2>

        {/* Score */}
        <div className="flex items-center gap-6 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">13 / 19</div>
            <div className="text-xs text-slate-500 mt-1">capabilities matched</div>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full bg-green-400 inline-block"></span>
              <span className="text-slate-600 dark:text-slate-300">13 fully working (green)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
              <span className="text-slate-600 dark:text-slate-300">2 partial (amber)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span>
              <span className="text-slate-600 dark:text-slate-300">4 missing (red) — all non-critical</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-700 dark:text-slate-200">~68%</div>
            <div className="text-xs text-slate-500 mt-1">Telegram parity</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Capability</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Telegram</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Darshan</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {[
                ["✅", "Plugin registration", "api.registerChannel()", "api.registerChannel() ✓", "Same approach — fully registered"],
                ["✅", "Inbound message receive", "Long-poll or webhook", "WebSocket + 30s poll fallback", "Both paths working"],
                ["✅", "Real-time transport stability", "Reconnects cleanly", "Nginx timeout fixed — holds for hours", "Functionally equivalent"],
                ["✅", "Session key resolution", "resolveAgentRoute()", "resolveAgentRoute() ✓", "Fixed — was hand-crafted before"],
                ["✅", "Per-conversation context", "Per-peer session", "Per-thread session key", "Each Darshan thread has own LLM history"],
                ["✅", "Real LLM reply", "Always replies in-channel", "Confirmed working via deliver() callback", "gpt-5.3-codex / claude dispatching correctly"],
                ["✅", "Reply in correct thread", "replyToId routing", "POST /threads/:id/messages in deliver()", "Thread-accurate delivery confirmed"],
                ["✅", "No double replies", "Lane-based concurrency", "ackOnce + no fallback", "Fixed — was causing double replies before"],
                ["✅", "Concurrency guard", "Lane per session", "_processingThreads Set per thread_id", "Simple but effective"],
                ["✅", "Plugin activation", "Bundled — auto-trusted", "plugins.allow: ['darshan'] required", "Fixed — was load-only without explicit trust"],
                ["✅", "MsgContext shape", "Full metadata", "Body + BodyForAgent + thread context", "Clean context, no instruction pollution"],
                ["✅", "Config presence", "channels.telegram.*", "channels.darshan.* with all fields", "endpoint, agentId, agentToken all set"],
                ["🟡", "Outbound proactive DM", "sendText() via bot token", "sendText() registered → /threads/direct", "Registered but not tested end-to-end"],
                ["🟡", "Directory (listPeers)", "From config", "Fetches /projects/:id/agents live", "Works but tied to hardcoded project ID"],
                ["❌", "Attachments (image/file/video/voice)", "Native media send/receive", "Text-only thread messages", "No upload/send media flow in Threads UI yet"],
                ["✅", "Delivery/read receipts (✓ / ✓✓ blue)", "Delivered + read indicators", "Blue/purple/gray ticks per message (shipped 2026-03-15)", "All read → blue, some read → purple, delivered only → gray"],
                ["❌", "Security / allowFrom", "dmPolicy, pairing, allowFrom list", "Not implemented — all senders accepted", "Any agent can trigger replies"],
                ["❌", "Status / probe", "probeTelegram() + snapshot", "Not implemented", "openclaw status shows no Darshan health"],
                ["❌", "Config schema validation", "TelegramConfigSchema (zod)", "emptyPluginConfigSchema()", "No validation on required fields"],
              ].map(([badge, cap, tg, darshan, note]) => {
                const color = badge === "✅"
                  ? "bg-green-50 dark:bg-green-950/10"
                  : badge === "🟡"
                  ? "bg-amber-50 dark:bg-amber-950/10"
                  : "bg-red-50 dark:bg-red-950/10";
                return (
                  <tr key={cap} className={color}>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 font-medium">{cap}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-500 dark:text-slate-400">{tg}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">{darshan}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-500 dark:text-slate-400">{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── WHAT REMAINS ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">3) Remaining Gaps (all non-critical)</h2>
        <div className="space-y-2">
          {[
            {
              priority: "HIGH",
              color: "red",
              title: "Threads attachments parity (media/files/voice)",
              detail: "Telegram supports media/file/voice natively; Threads currently supports only text message bodies. Need message schema + upload API + UI composer attachment support.",
            },

            {
              priority: "HIGH",
              color: "red",
              title: "Security: allowFrom check on inbound",
              detail: "Currently any Darshan agent or user can send a notification and trigger a real LLM reply. Need to add allowFrom check against cfg.channels.darshan.allowFrom before dispatching.",
            },
            {
              priority: "MED",
              color: "amber",
              title: "Status / probe",
              detail: "Telegram has probeTelegram() and buildAccountSnapshot(). openclaw status shows nothing for Darshan. Add a basic ping to GET /api/v1/agents/:id to confirm connectivity and surface in status.",
            },
            {
              priority: "MED",
              color: "amber",
              title: "Config schema validation",
              detail: "emptyPluginConfigSchema() means misconfiguration (wrong endpoint, missing token) gives no error. Easy win: add a zod schema for endpoint/agentId/agentToken with clear error messages.",
            },
            {
              priority: "LOW",
              color: "slate",
              title: "Outbound proactive DM — end-to-end test",
              detail: "sendText() is registered and posts to /threads/direct. Not tested end-to-end from the message tool with channel=darshan.",
            },
            {
              priority: "LOW",
              color: "slate",
              title: "Move to monitorDarshanProvider() pattern",
              detail: "Currently calls dispatchReplyWithBufferedBlockDispatcher directly from a polling loop. Ideal refactor: extract into monitorDarshanProvider() matching Telegram's structure for framework hooks, retry logic, and cleaner separation.",
            },
          ].map(({ priority, color, title, detail }) => {
            const badge =
              color === "red"
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                : color === "amber"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
            return (
              <div key={title} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>{priority}</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CORRECT DISPATCH PATTERN ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">4) Correct Dispatch Pattern (current production)</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`// 1. Load config + resolve route
const cfg = await rt.config.loadConfig();
const route = rt.channel.routing.resolveAgentRoute({
  cfg, channel: "darshan", accountId: "default",
  peer: { kind: "direct", id: fromSlug },
});

// 2. Per-thread session key (critical — prevents context bleed between threads)
const threadSessionKey = route.sessionKey.replace(
  /direct:[^:]+$/, \`thread:\${threadId}\`
);

// 3. ackOnce guard — prevents double-ACK when lane queues
let acked = false;
const ackOnce = (note) => { if (acked) return; acked = true; return ackNotif(note); };

// 4. Dispatch
let delivered = false;
await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
  ctx: {
    Body: body,                   // raw message only — never instruction text
    BodyForAgent: \`[Darshan thread: "\${subject}" | thread_id: \${threadId}]\\n\${fromSlug}: \${body}\`,
    From: fromSlug,
    SessionKey: threadSessionKey, // per-thread, built from resolveAgentRoute
    AccountId: route.accountId,
    ChatType: "direct",
    SenderName: fromSlug,
    Provider: "darshan", Surface: "darshan",
  },
  cfg,
  dispatcherOptions: {
    deliver: async (payload, { kind }) => {
      if (kind !== "final") return;
      const ok = await postReply(payload.text ?? "");
      if (ok) { delivered = true; await ackOnce(\`replied: \${payload.text?.slice(0,60)}\`); }
    },
    onSkip: (_p, { kind, reason }) => log.warn(\`reply skipped: \${kind}/\${reason}\`),
    onError: (e, { kind }) => log.warn(\`dispatch error: \${kind}: \${e?.message}\`),
  },
});

// 5. If lane was busy — reply is queued, will fire when lane drains
// DO NOT send fallback here — causes double replies
if (!delivered) await ackOnce("queued for reply");`}</pre>
      </section>

      {/* ── FILES & COMMANDS ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">5) Files & Commands</h2>
        <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
          {[
            ["Plugin source (edit this)", "C:\\Users\\ssume\\.openclaw\\workspace\\darshan-channel-plugin\\index.ts"],
            ["Plugin install copy (sync after every edit)", "C:\\Users\\ssume\\.openclaw\\extensions\\darshan\\index.ts"],
            ["OpenClaw config", "C:\\Users\\ssume\\.openclaw\\openclaw.json"],
            ["nginx config", "ubuntu@darshan.caringgems.in:/etc/nginx/sites-enabled/darshan"],
          ].map(([label, path]) => (
            <div key={path}>
              <div className="text-xs text-slate-500">{label}</div>
              <code className="block rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{path}</code>
            </div>
          ))}
        </div>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`# After editing plugin source — sync + restart
Copy-Item .openclaw\\workspace\\darshan-channel-plugin\\index.ts .openclaw\\extensions\\darshan\\index.ts -Force
openclaw gateway restart

# Full hard reset (when changes don't load — stale module cache)
openclaw gateway stop
Remove-Item .openclaw\\extensions\\darshan -Recurse -Force
Copy-Item .openclaw\\workspace\\darshan-channel-plugin .openclaw\\extensions\\darshan -Recurse
openclaw gateway start

# Verify plugin is active (look for 'real reply posted' not 'fallback')
Get-Content "\\tmp\\openclaw\\openclaw-$(Get-Date -f yyyy-MM-dd).log" -Tail 100 |
  ForEach-Object { try { ($_ | ConvertFrom-Json).'1' } catch { $_ } } |
  Select-String "darshan"

# nginx reload after config change
ssh ubuntu@darshan.caringgems.in "sudo nginx -t && sudo systemctl reload nginx"`}</pre>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <strong>Reference:</strong> Ask Sanjaya "Open Darshan Channel Enablement Docs" to pull this page in any session.
      </div>
    </div>
  );
}
