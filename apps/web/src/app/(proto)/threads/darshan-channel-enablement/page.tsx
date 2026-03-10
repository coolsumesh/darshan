export default function DarshanChannelEnablementPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Darshan Channel — Architecture, Fixes & Telegram Gap Analysis
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Last updated: 2026-03-10. Tracks all plugin fixes, architectural decisions, and what remains to close the gap with Telegram-grade channel reliability.
      </p>

      {/* ── STATUS BANNER ── */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/20">
        <div className="flex items-center gap-2">
          <span className="text-green-600 dark:text-green-400 text-lg">●</span>
          <span className="font-semibold text-green-800 dark:text-green-300">Current status: Inbound working, real LLM reply in progress</span>
        </div>
        <ul className="mt-2 text-sm text-green-700 dark:text-green-400 list-disc pl-5 space-y-0.5">
          <li>WebSocket stable — no 60s drops since nginx timeout fix (2026-03-10)</li>
          <li>Notifications received and ACK'd correctly</li>
          <li>Fallback reply working; real LLM reply path under active testing</li>
          <li>Outbound (proactive DM) registered but untested end-to-end</li>
        </ul>
      </div>

      {/* ── FIXES LOG ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">1) Fixes Applied (2026-03-10)</h2>
        <div className="space-y-2">
          {[
            {
              title: "WS drops every 60s — nginx proxy_read_timeout",
              status: "fixed",
              detail: "nginx default proxy_read_timeout=60s was dropping idle WebSocket connections. Added proxy_read_timeout 3600s and proxy_send_timeout 3600s to the /api/backend/ location block in /etc/nginx/sites-enabled/darshan. WS now stays stable.",
              code: `# /etc/nginx/sites-enabled/darshan — inside location /api/backend/
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;`,
            },
            {
              title: "Client-side WS keepalive ping",
              status: "fixed",
              detail: "Added a 30s interval ping (JSON {type:'ping'}) from the client on WS open. Handles cases where the backend initiates a close rather than nginx. Clears on abort/close.",
              code: `const pingInterval = setInterval(() => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
}, 30000);`,
            },
            {
              title: "BodyForAgent instruction pollution causing NO_REPLY",
              status: "fixed",
              detail: "Body/BodyForAgent were set to instruction text ('You are Sanjaya. Never output NO_REPLY...'). The LLM saw this as a user message with meta-instructions and returned NO_REPLY. Fixed by setting Body = raw user message, BodyForAgent = clean thread context label only.",
              code: `// Before (wrong)
Body: "You are Sanjaya. Reply naturally. Never output NO_REPLY. From: X. Message: Y"

// After (correct — matches Telegram pattern)
Body: body,
BodyForAgent: \`[Darshan thread: "\${subject}"] \${fromSlug}: \${body}\``,
            },
            {
              title: "Hand-crafted SessionKey breaking session routing",
              status: "fixed",
              detail: "Plugin was using strings like 'darshan:thread:xxx:msg:yyy' as SessionKey. These don't match the internal session key format, so no session history loads and the model has no context. Fixed by calling resolveAgentRoute() which builds the correct key.",
              code: `// Before (wrong)
SessionKey: "darshan:thread:xxx:msg:yyy:os:win32"

// After (correct)
const route = rt.channel.routing.resolveAgentRoute({
  cfg, channel: "darshan", accountId: "default",
  peer: { kind: "direct", id: fromSlug },
});
SessionKey: route.sessionKey`,
            },
            {
              title: "OriginatingChannel: 'darshan' breaking reply routing",
              status: "fixed",
              detail: "'darshan' is not a registered ChannelId. Setting it caused the framework to try resolving an unknown channel for outbound delivery, which failed silently. Removed — we use a custom deliver() callback instead.",
            },
            {
              title: "(api as any).runtime casts — 4 places",
              status: "fixed",
              detail: "Plugin used (api as any).runtime in 4 places. api.runtime is a typed property on OpenClawPluginApi. Changed all to api.runtime / _runtime.config.loadConfig() directly.",
            },
            {
              title: "No concurrency guard — duplicate replies on same thread",
              status: "fixed",
              detail: "Multiple notifications for the same thread arriving simultaneously would spawn parallel LLM dispatches, causing duplicate replies. Added a _processingThreads Set that blocks a second dispatch for the same thread_id until the first completes.",
              code: `const _processingThreads = new Set<string>();
// In handleIncomingNotif:
if (_processingThreads.has(threadId)) return; // skip
_processingThreads.add(threadId);
handleNotification(...).finally(() => _processingThreads.delete(threadId));`,
            },
          ].map(({ title, status, detail, code }) => (
            <div key={title} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status === "fixed" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                  {status === "fixed" ? "✓ FIXED" : "⚠ OPEN"}
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
        <h2 className="text-lg font-semibold">2) Gap Analysis vs Telegram</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          How close is Darshan to Telegram-grade reliability? Green = done, Amber = partial, Red = missing.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Capability</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Telegram</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Darshan</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Gap / Next step</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {[
                ["Plugin registration", "✅ api.registerChannel()", "✅ api.registerChannel()", "Same approach — done"],
                ["Inbound message receive", "✅ Long-poll or webhook", "✅ WebSocket + 30s poll fallback", "Both work. WS is now stable."],
                ["Real-time transport stability", "✅ Reconnects cleanly", "✅ Reconnects in 5s; nginx timeout fixed", "Functionally equivalent now"],
                ["Session key resolution", "✅ resolveAgentRoute()", "✅ resolveAgentRoute() — fixed 2026-03-10", "Fixed — was hand-crafted before"],
                ["MsgContext shape", "✅ Body + BodyForAgent + full metadata", "🟡 Body + BodyForAgent — minimal metadata", "Missing: ReplyToId, MessageSid, thread history. Low priority."],
                ["LLM dispatch", "✅ Framework handles via monitorTelegramProvider", "🟡 Plugin calls dispatchReplyWithBufferedBlockDispatcher directly", "Works but more fragile. Ideal: move to proper channel adapter."],
                ["Real LLM reply", "✅ Always replies in-channel", "🟡 LLM path active; fallback still fires sometimes", "Under active testing — onSkip reason logging added"],
                ["Outbound delivery", "✅ sendText() via bot token", "🟡 sendText() registered — posts to /threads/direct", "Registered but untested end-to-end for proactive DMs"],
                ["Reply in existing thread", "✅ via replyToId", "✅ POST /threads/:id/messages in deliver()", "Working correctly"],
                ["Concurrency guard", "✅ Lane-based per-session", "✅ _processingThreads Set — fixed 2026-03-10", "Simple but effective"],
                ["Security / allowFrom", "✅ dmPolicy, pairing, allowFrom list", "❌ Not implemented — all notifications accepted", "Any agent/user can trigger replies. Needs allowFrom check."],
                ["Directory (listPeers)", "✅ From config", "🟡 Fetches from /projects/:id/agents", "Works but tied to hardcoded project ID"],
                ["Config schema validation", "✅ TelegramConfigSchema (zod)", "❌ emptyPluginConfigSchema()", "No validation on endpoint/token fields"],
                ["Status / probe", "✅ probeTelegram(), buildAccountSnapshot()", "❌ Not implemented", "openclaw status won't show Darshan health"],
                ["Onboarding wizard", "✅ telegramOnboardingAdapter", "❌ Not implemented", "Manual config required"],
                ["Media support", "✅ Images, voice, files", "❌ Not implemented", "Text-only currently"],
                ["Block streaming", "✅ Supported", "❌ Disabled (blockStreaming: false)", "Would need chunked delivery to thread"],
              ].map(([cap, tg, darshan, gap]) => {
                const color = darshan.startsWith("✅")
                  ? "bg-green-50 dark:bg-green-950/10"
                  : darshan.startsWith("🟡")
                  ? "bg-amber-50 dark:bg-amber-950/10"
                  : "bg-red-50 dark:bg-red-950/10";
                return (
                  <tr key={cap} className={color}>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 font-medium">{cap}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-500">{tg}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">{darshan}</td>
                    <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-500">{gap}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── WHAT REMAINS ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">3) What Remains to Reach Telegram Parity</h2>
        <div className="space-y-2">
          {[
            {
              priority: "HIGH",
              color: "red",
              title: "Confirm real LLM reply path works end-to-end",
              detail: "LLM dispatch is wired correctly now (resolveAgentRoute + correct BodyForAgent). Need a live test to confirm deliver() is called instead of falling back. Check logs for 'real reply posted' vs 'fallback reply posted'.",
            },
            {
              priority: "HIGH",
              color: "red",
              title: "Security: allowFrom check on inbound notifications",
              detail: "Currently any agent or user can send a notification and get a reply. Need to add an allowFrom list check against cfg.channels.darshan.allowFrom before dispatching to LLM.",
            },
            {
              priority: "MED",
              color: "amber",
              title: "Status / probe implementation",
              detail: "Telegram has probeTelegram() and buildAccountSnapshot(). Darshan has nothing — openclaw status shows no Darshan health. Add a basic ping to GET /api/v1/agents/:id to confirm connectivity.",
            },
            {
              priority: "MED",
              color: "amber",
              title: "Config schema validation",
              detail: "emptyPluginConfigSchema() means no validation on endpoint/agentId/agentToken fields. Easy win: add a zod schema that validates required fields and gives a clear error on misconfiguration.",
            },
            {
              priority: "MED",
              color: "amber",
              title: "Outbound proactive DM — end-to-end test",
              detail: "sendText() is registered and posts to /threads/direct. Not tested end-to-end. Test by triggering a proactive message from the message tool with channel=darshan.",
            },
            {
              priority: "LOW",
              color: "slate",
              title: "Move to proper channel adapter (monitorDarshanProvider)",
              detail: "Currently calls dispatchReplyWithBufferedBlockDispatcher directly from a polling loop. Ideal: extract into a proper monitorDarshanProvider() function matching Telegram's structure. This would give automatic route resolution, retry logic, and framework hooks.",
            },
            {
              priority: "LOW",
              color: "slate",
              title: "Onboarding wizard",
              detail: "Manual config in openclaw.json is the only option. A setup wizard (like telegramOnboardingAdapter) would let users configure Darshan via openclaw setup.",
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
        <h2 className="text-lg font-semibold">4) Correct Dispatch Pattern (current)</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`const cfg = await rt.config.loadConfig();
const route = rt.channel.routing.resolveAgentRoute({
  cfg, channel: "darshan", accountId: "default",
  peer: { kind: "direct", id: fromSlug },
});

await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
  ctx: {
    Body: body,                    // raw message — never instruction text
    BodyForAgent: \`[Darshan thread: "\${subject}"] \${fromSlug}: \${body}\`,
    From: fromSlug,
    SessionKey: route.sessionKey,  // ALWAYS from resolveAgentRoute
    AccountId: route.accountId,
    ChatType: "direct",
    SenderName: fromSlug,
    Provider: "darshan",
    Surface: "darshan",
  },
  cfg,
  dispatcherOptions: {
    deliver: async (payload, { kind }) => {
      if (kind !== "final") return;
      await postReply(payload.text ?? "");   // POST to /threads/:id/messages
      delivered = true;
    },
    onSkip: (_payload, { kind, reason }) => {
      log.warn(\`reply skipped: kind=\${kind} reason=\${reason}\`);
      // reason="silent" → NO_REPLY; reason="heartbeat" → HEARTBEAT_OK
    },
    onError: (err, { kind }) => {
      log.warn(\`dispatch error: kind=\${kind}: \${err?.message}\`);
    },
  },
});`}</pre>
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
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`# Sync + restart after plugin edits
Copy-Item .openclaw\\workspace\\darshan-channel-plugin\\index.ts .openclaw\\extensions\\darshan\\index.ts -Force
openclaw gateway restart

# Full hard reset (when code doesn't take effect)
openclaw gateway stop
Remove-Item .openclaw\\extensions\\darshan -Recurse -Force
Copy-Item .openclaw\\workspace\\darshan-channel-plugin .openclaw\\extensions\\darshan -Recurse
openclaw gateway start

# Check WS stability
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
