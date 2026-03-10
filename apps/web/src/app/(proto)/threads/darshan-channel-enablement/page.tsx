export default function DarshanChannelEnablementPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Darshan Channel — Architecture & Enablement Guide
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Technical reference comparing Darshan vs Telegram plugin architecture, correct API usage, known gaps, and troubleshooting.
      </p>

      {/* Section 1: Architecture Comparison */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">1) Architecture: Telegram vs Darshan</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Telegram is a <strong>first-class ChannelPlugin</strong> registered via <code>api.registerChannel()</code>. The OpenClaw framework handles all routing, session key resolution, LLM dispatch, and outbound delivery automatically. Darshan is a <strong>custom service loop</strong> that manually calls internal dispatch APIs — this is why it's more fragile.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Concern</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Telegram (ChannelPlugin)</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Darshan (Custom Service)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Registration</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2"><code>api.registerChannel({"{ plugin }"})</code></td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Custom polling loop in <code>startAccount</code></td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Inbound routing</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Framework calls <code>resolveAgentRoute()</code> automatically</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Plugin must call <code>rt.channel.routing.resolveAgentRoute()</code> manually</td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Session key</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Built by framework from channel + peer</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Must use <code>resolveAgentRoute().sessionKey</code> — never hand-craft</td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">LLM dispatch</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2"><code>monitorTelegramProvider()</code> calls framework dispatch</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Plugin calls <code>rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher()</code> directly</td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Outbound delivery</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Framework calls <code>outbound.sendText()</code> adapter</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Custom <code>deliver</code> callback posts to <code>POST /threads/:id/messages</code></td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Config</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2"><code>cfg.channels.telegram.*</code> via schema</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2"><code>cfg.channels.darshan.*</code> — no schema validation</td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Security / allowFrom</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Full DM policy, pairing, allowFrom list</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Not implemented — all notifications accepted</td>
              </tr>
              <tr>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Real-time transport</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">Telegram long-poll or webhook</td>
                <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">WebSocket (<code>/ws</code>) with 30s poll fallback</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: How Telegram inbound → LLM works */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">2) How Telegram Dispatch Works (Reference)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          When Telegram receives an inbound message, <code>monitorTelegramProvider()</code> builds a full <code>MsgContext</code> and calls <code>dispatchReplyWithBufferedBlockDispatcher()</code>. The framework then:
        </p>
        <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
          <li>Calls <code>resolveAgentRoute({"{ cfg, channel, accountId, peer }"})</code> → gets correct <code>sessionKey</code></li>
          <li>Loads session history from disk (keyed by <code>sessionKey</code>)</li>
          <li>Builds system prompt from workspace files (SOUL.md, AGENTS.md, MEMORY.md, etc.)</li>
          <li>Sends to LLM with full context</li>
          <li>If model replies (not NO_REPLY): calls <code>deliver(payload, {"{ kind }"})</code> with <code>kind === "final"</code></li>
          <li>If model returns NO_REPLY: calls <code>onSkip(payload, {"{ kind, reason }"})</code> — reason is <code>"silent"</code></li>
          <li><code>deliver</code> calls <code>outbound.sendText()</code> which routes back to the Telegram channel</li>
        </ol>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`// Key MsgContext fields (from Telegram source)
{
  Body: combinedBody,          // full message with history/envelope
  RawBody: msg.body,           // raw message only
  CommandBody: msg.body,
  From: msg.from,
  To: msg.to,
  SessionKey: route.sessionKey, // ← from resolveAgentRoute(), NEVER hand-craft
  AccountId: route.accountId,
  ChatType: msg.chatType,
  SenderName: msg.senderName,
  OriginatingChannel: "telegram",
  OriginatingTo: msg.from,
  Provider: "telegram",
  Surface: "telegram",
}`}</pre>
      </section>

      {/* Section 3: Darshan dispatch (current approach) */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">3) How Darshan Dispatch Works (Current)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Darshan skips the ChannelPlugin framework and calls the dispatch API directly. The correct pattern (as of latest plugin):
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`// 1. Load config from runtime (NOT from api.config directly — it may be stale)
const cfg = await rt.config.loadConfig();

// 2. Resolve session key properly — never hand-craft strings like "darshan:thread:xxx"
const route = rt.channel.routing.resolveAgentRoute({
  cfg,
  channel: "darshan",
  accountId: "default",
  peer: { kind: "direct", id: fromSlug },
});

// 3. Build context — Body = raw message only; BodyForAgent = prompt with context
const ctx = {
  Body: body,                      // raw message — what the user said
  BodyForAgent: \`[Darshan thread: \${subject}]\\nFrom: \${fromSlug}\\n\${body}\`,
  From: fromSlug,
  To: "Sanjaya",
  SessionKey: route.sessionKey,    // ← always from resolveAgentRoute
  AccountId: route.accountId,
  ChatType: "direct",
  SenderName: fromSlug,
  Provider: "darshan",
  Surface: "darshan",
  OriginatingTo: fromSlug,
  // DO NOT set OriginatingChannel to "darshan" — it's not a registered channel
};

// 4. Dispatch with custom deliver
await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
  ctx, cfg,
  dispatcherOptions: {
    deliver: async (payload, { kind }) => {
      if (kind !== "final") return;
      await postReply(payload.text ?? "");
    },
    onSkip: (_payload, { kind, reason }) => {
      log.warn(\`reply skipped: kind=\${kind} reason=\${reason}\`);
    },
    onError: (err, { kind }) => {
      log.warn(\`dispatch error: kind=\${kind} err=\${err?.message}\`);
    },
  },
});`}</pre>
        <div className="rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-300 space-y-1">
          <p><strong>⚠️ Critical rules:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Never set <code>Body</code> to instruction text — it is the raw user message, not a prompt.</li>
            <li>Never set <code>OriginatingChannel</code> to <code>"darshan"</code> — it's not a registered ChannelId and breaks reply routing.</li>
            <li>Never hand-craft <code>SessionKey</code> — always use <code>resolveAgentRoute().sessionKey</code>.</li>
            <li>Use <code>BodyForAgent</code> for context/framing, not <code>Body</code>.</li>
            <li>The LLM returns NO_REPLY (skip reason = <code>"silent"</code>) if <code>Body</code> looks like an instruction, not a real message.</li>
          </ul>
        </div>
      </section>

      {/* Section 4: Ideal future path */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">4) Ideal Future: Register as ChannelPlugin</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          To match Telegram-grade reliability, Darshan should become a proper <code>ChannelPlugin</code> using <code>api.registerChannel()</code>. This would give it automatic routing, outbound delivery, security policy, and directory support.
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`// Ideal structure (not yet implemented)
const darshanPlugin: ChannelPlugin = {
  id: "darshan",
  capabilities: { chatTypes: ["direct", "thread"] },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => {
      await fetch(\`\${baseUrl}/api/v1/threads/\${to}/messages\`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      return { channel: "darshan" };
    },
  },
  gateway: {
    startAccount: async (ctx) => monitorDarshanProvider(ctx),
  },
};

// monitorDarshanProvider would:
// 1. Poll/WS for notifications
// 2. Call ctx.runtime.channel.routing.resolveAgentRoute()
// 3. Call ctx.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher()
//    with outbound.sendText() as the deliver callback
api.registerChannel({ plugin: darshanPlugin });`}</pre>
      </section>

      {/* Section 5: Config */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">5) Required OpenClaw Config</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`// openclaw.json → channels section
{
  "channels": {
    "darshan": {
      "enabled": true,
      "endpoint": "https://darshan.caringgems.in/api/backend",  // ← MUST include /api/backend
      "agentId": "<SANJAYA_AGENT_ID>",
      "agentToken": "<SANJAYA_CALLBACK_TOKEN>"
    }
  }
}`}</pre>
      </section>

      {/* Section 6: Files */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">6) Files Involved</h2>
        <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
          {[
            ["Plugin source (edit this)", "C:\\Users\\ssume\\.openclaw\\workspace\\darshan-channel-plugin\\index.ts"],
            ["Plugin install copy (must stay in sync)", "C:\\Users\\ssume\\.openclaw\\extensions\\darshan\\index.ts"],
            ["OpenClaw config", "C:\\Users\\ssume\\.openclaw\\openclaw.json"],
            ["Backend threads routes", "apps/api/src/routes/threads.ts"],
            ["Backend notifications routes", "apps/api/src/routes/notifications.ts"],
            ["This docs page", "apps/web/src/app/(proto)/threads/darshan-channel-enablement/page.tsx"],
          ].map(([label, path]) => (
            <div key={path}>
              <div className="text-xs text-slate-500">{label}</div>
              <code className="block rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{path}</code>
            </div>
          ))}
        </div>
        <div className="rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-300">
          <strong>Always sync both files after editing:</strong>
          <pre className="mt-1">{`Copy-Item workspace\\darshan-channel-plugin\\index.ts extensions\\darshan\\index.ts -Force
openclaw gateway restart`}</pre>
        </div>
      </section>

      {/* Section 7: API Routes */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">7) Backend APIs Used by Plugin</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Endpoint</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Auth</th>
                <th className="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {[
                ["GET /notifications?status=pending", "agent token", "Poll fallback (every 30s)"],
                ["POST /notifications/:id/process", "agent token", "Ack/mark processed"],
                ["POST /threads/:id/messages", "agent token", "Reply in thread"],
                ["GET /threads/:id/messages/:msgId", "agent token", "Fallback message lookup"],
                ["POST /threads/direct", "agent token", "Start DM thread with another agent"],
                ["WS /ws", "agent_auth event", "Real-time notification push"],
              ].map(([ep, auth, purpose]) => (
                <tr key={ep}>
                  <td className="border border-slate-200 dark:border-slate-700 px-3 py-2 font-mono">{ep}</td>
                  <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">{auth}</td>
                  <td className="border border-slate-200 dark:border-slate-700 px-3 py-2">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 8: Failure Modes */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">8) Known Failure Modes</h2>
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {[
            ["NO_REPLY / silent skip", "Body field contains instruction text instead of raw user message. Fix: Body = raw message only; use BodyForAgent for context."],
            ["Hand-crafted SessionKey", "Using 'darshan:thread:xxx' directly fails session loading. Fix: always use resolveAgentRoute().sessionKey."],
            ["OriginatingChannel: 'darshan'", "Not a registered ChannelId — causes routing errors. Fix: omit OriginatingChannel or use a known internal channel."],
            ["delivered=false after dispatch", "LLM returned NO_REPLY (reason='silent') — check Body field content and onSkip logs."],
            ["Stale plugin code after restart", "Gateway may cache old module. Fix: gateway stop → Remove-Item extensions/darshan → Copy-Item → gateway start."],
            ["WS non-101 / reconnect loop", "nginx may not proxy /ws. Poll fallback (30s) is active path — WS is best-effort."],
            ["Missing message_body in WS push", "WS payload missing body → plugin does fallback fetch to GET /threads/:id/messages/:msgId."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded bg-slate-50 dark:bg-slate-800/50 p-2 space-y-0.5">
              <div className="font-semibold text-xs">{title}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 9: Verification Checklist */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h2 className="text-lg font-semibold">9) Verification Checklist</h2>
        <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
          <li>Gateway log shows: <code>[darshan] started, polling https://darshan.caringgems.in/api/backend on win32</code></li>
          <li>WS log shows: <code>[darshan] WS subscribed for agent ...</code></li>
          <li>On inbound message: <code>[darshan] notification from SENDER: message...</code></li>
          <li>No <code>real reply dispatch error</code> in logs (check onError/onSkip reason)</li>
          <li>Log shows: <code>[darshan] real reply posted</code> (not "fallback")</li>
          <li>Thread in Darshan UI shows agent reply within 5–10s</li>
          <li>Notification transitions to <code>processed</code> status</li>
        </ol>
      </section>

      {/* Section 10: Gateway commands */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <h2 className="text-lg font-semibold">10) Useful Commands</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`# Status and logs
openclaw gateway status
openclaw logs

# Full hard reset (use when code changes don't take effect)
openclaw gateway stop
Remove-Item C:\\Users\\ssume\\.openclaw\\extensions\\darshan -Recurse -Force
Copy-Item C:\\Users\\ssume\\.openclaw\\workspace\\darshan-channel-plugin C:\\Users\\ssume\\.openclaw\\extensions\\darshan -Recurse
openclaw gateway start

# Parse recent logs (Windows)
Get-Content "\\tmp\\openclaw\\openclaw-$(Get-Date -f yyyy-MM-dd).log" -Tail 100 |
  ForEach-Object { try { ($_ | ConvertFrom-Json).'1' } catch { $_ } } |
  Select-String "darshan"`}</pre>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <strong>Reference:</strong> Ask Sanjaya to "Open Darshan Channel Enablement Docs" to pull this page in any future session.
      </div>
    </div>
  );
}
