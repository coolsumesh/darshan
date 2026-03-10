export default function DarshanChannelEnablementPage() {
  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Darshan Channel Enablement — Complete Technical Notes</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        This page documents the Darshan channel setup end-to-end: install paths, source files, backend routes,
        runtime behavior, and troubleshooting checklist.
      </p>

      <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">1) Core Architecture</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>Darshan plugin runs inside OpenClaw Gateway as a custom channel (<code>darshan</code>).</li>
          <li>Inbound flow: Darshan notification (WS or poll) → plugin <code>handleNotification()</code> → OpenClaw session dispatch → optional thread reply.</li>
          <li>Outbound flow: OpenClaw reply → plugin <code>sendText()</code> → Darshan <code>POST /api/v1/threads/direct</code>.</li>
          <li>Primary real-time path uses WebSocket (<code>/ws</code>), with poll fallback on <code>/api/v1/notifications?status=pending</code>.</li>
        </ul>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">2) Files Involved</h2>
        <div className="text-sm text-slate-700 dark:text-slate-300 space-y-3">
          <div>
            <div className="font-semibold">OpenClaw plugin (installed runtime copy)</div>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">C:\Users\ssume\.openclaw\extensions\darshan\index.ts</code>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">C:\Users\ssume\.openclaw\extensions\darshan\openclaw.plugin.json</code>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">C:\Users\ssume\.openclaw\extensions\darshan\package.json</code>
          </div>
          <div>
            <div className="font-semibold">OpenClaw plugin source path (install source)</div>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">C:\Users\ssume\.openclaw\workspace\darshan-channel-plugin\index.ts</code>
          </div>
          <div>
            <div className="font-semibold">OpenClaw config</div>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">C:\Users\ssume\.openclaw\openclaw.json</code>
          </div>
          <div>
            <div className="font-semibold">Darshan backend routes</div>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">apps/api/src/routes/threads.ts</code>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">apps/api/src/routes/notifications.ts</code>
          </div>
          <div>
            <div className="font-semibold">Darshan web (this docs page + threads page)</div>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">apps/web/src/app/(proto)/threads/page.tsx</code>
            <code className="block rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">apps/web/src/app/(proto)/threads/darshan-channel-enablement/page.tsx</code>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">3) Required OpenClaw Channel Config</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`{
  "channels": {
    "darshan": {
      "enabled": true,
      "endpoint": "https://darshan.caringgems.in/api/backend",
      "apiKey": "<INTERNAL_API_KEY>",
      "agentId": "<SANJAYA_AGENT_ID>",
      "agentToken": "<SANJAYA_CALLBACK_TOKEN>"
    }
  }
}`}</pre>
        <p className="text-xs text-slate-500">Critical: endpoint must include <code>/api/backend</code>.</p>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">4) Backend APIs Used by Channel</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li><code>GET /api/v1/notifications?status=pending</code> (poll fallback)</li>
          <li><code>POST /api/v1/notifications/:id/process</code> (ack/process)</li>
          <li><code>POST /api/v1/threads/:thread_id/messages</code> (thread reply)</li>
          <li><code>POST /api/v1/threads/direct</code> (outbound direct message)</li>
          <li><code>GET /api/v1/threads/:thread_id/messages/:message_id</code> (message fallback lookup)</li>
          <li><code>WS /ws</code> (agent real-time subscription + notification push)</li>
        </ul>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">5) Runtime + Service Commands</h2>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">{`openclaw status
openclaw gateway status
openclaw gateway restart
openclaw logs
`}</pre>
        <p className="text-xs text-slate-500">On Windows, avoid Unix-only commands like <code>head</code>/<code>tail</code>.</p>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">6) Known Failure Modes</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li><code>delivered=false</code> from channel dispatch despite notification pickup.</li>
          <li>WS instability (<code>non-101</code> / reconnect loops) when reverse proxy doesn’t correctly handle <code>/ws</code>.</li>
          <li>Missing <code>message_body/message_from</code> in WS payload causes low-context dispatch.</li>
          <li>Session routing gap: thread notifications may run inside isolated <code>darshan:thread:*</code> sessions.</li>
        </ul>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">7) Verification Checklist</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>Channel subscribed log appears: <code>[darshan] WS subscribed for agent ...</code></li>
          <li>Incoming thread message creates pending notification.</li>
          <li>Plugin receives notification with correct <code>message_from/message_body</code>.</li>
          <li>Reply posts to target thread (<code>POST /threads/:id/messages</code> success).</li>
          <li>Notification transitions from <code>pending</code> → <code>processed</code>.</li>
        </ol>
      </section>

      <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <strong>Usage note for future conversations:</strong> ask “Open Darshan Channel Enablement Docs” and refer to this page.
      </section>
    </div>
  );
}
