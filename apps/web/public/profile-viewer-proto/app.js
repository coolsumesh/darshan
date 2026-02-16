const MOCK_IDENTITY = `# IDENTITY.md (mocked)

Name: Darshan Agent Alpha
Role: Research / Planning
Team: Core

Notes:
- Prototype data only.
- In real app, this should load from IDENTITY.md.
`;

const MOCK_USER = `# USER.md (mocked)

User notes:
- Prefers concise summaries
- Works UTC hours
- Interested in reliability + privacy

(Prototype / mocked content)
`;

const MOCK_MEMORY = `# MEMORY.md (mocked)

Long-term memory (sample):
- 2026-01: Built initial Darshan UI prototype
- 2026-02: Added Profile Viewer (read-only)

(Prototype / mocked content)
`;

const state = {
  selectedAgentId: 'agent-1',
};

const AGENTS = [
  {
    id: 'agent-1',
    name: 'Agent Alpha',
    status: 'Online',
    model: 'gpt-4.x (mock)',
    lastSeen: 'Just now',
    notes: 'Primary sandbox agent (prototype)'
  },
  {
    id: 'agent-2',
    name: 'Agent Beta',
    status: 'Idle',
    model: 'gemini (mock)',
    lastSeen: '5m ago',
    notes: 'Runner / automation agent (prototype)'
  },
];

function qs(sel, el = document) { return el.querySelector(sel); }
function qsa(sel, el = document) { return Array.from(el.querySelectorAll(sel)); }

function setNavActive(hash) {
  qsa('.navlink').forEach(a => a.classList.remove('active'));
  if (hash === '#team') qs('#nav-team').classList.add('active');
  else qs('#nav-agents').classList.add('active');
}

function render() {
  const app = qs('#app');
  const hash = window.location.hash || '#';
  setNavActive(hash);

  if (hash === '#team') {
    app.innerHTML = renderTeamPage();
    wireTeamPage();
    return;
  }

  app.innerHTML = renderAgentsPage();
  wireAgentsPage();
}

function renderAgentsPage() {
  const selected = AGENTS.find(a => a.id === state.selectedAgentId) || AGENTS[0];

  return `
    <div class="grid">
      <section class="card">
        <h3>Agents</h3>
        <div class="list">
          ${AGENTS.map(a => `
            <div class="agent" data-agent-id="${a.id}">
              <div class="meta">
                <div class="name">${a.name}</div>
                <div class="small muted">${a.status} • ${a.model}</div>
              </div>
              <button class="btn" data-action="select">Inspect</button>
            </div>
          `).join('')}
        </div>
      </section>

      <aside class="card">
        <h3>Agent Inspector (right pane)</h3>
        <div class="inspector">
          <div class="kv">
            <div>Name</div><div>${selected.name}</div>
            <div>Status</div><div>${selected.status}</div>
            <div>Model</div><div>${selected.model}</div>
            <div>Last seen</div><div>${selected.lastSeen}</div>
            <div>Notes</div><div>${selected.notes}</div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="view-profile">View Profile</button>
          </div>
          <div class="muted small">Prototype: button opens a read-only profile viewer with mocked content.</div>
        </div>
      </aside>
    </div>
  `;
}

function renderTeamPage() {
  return `
    <section class="card">
      <h3>Team</h3>
      <div class="muted small" style="margin-bottom:10px;">Prototype team directory.</div>
      <div class="list">
        ${AGENTS.map(a => `
          <div class="agent">
            <div class="meta">
              <div class="name">${a.name}</div>
              <div class="small muted">${a.status} • ${a.model}</div>
            </div>
            <button class="btn btn-primary" data-action="view-profile" data-agent-id="${a.id}">View Profile</button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function wireAgentsPage() {
  qsa('[data-action="select"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('[data-agent-id]');
      state.selectedAgentId = row.getAttribute('data-agent-id');
      render();
    });
  });
  const view = qs('#view-profile');
  if (view) view.addEventListener('click', () => openProfileViewer(state.selectedAgentId));
}

function wireTeamPage() {
  qsa('[data-action="view-profile"]').forEach(btn => {
    btn.addEventListener('click', () => openProfileViewer(btn.getAttribute('data-agent-id')));
  });
}

function openProfileViewer(agentId) {
  // For now, content is mocked and not agent-specific.
  qs('#profile-identity').textContent = MOCK_IDENTITY;
  qs('#profile-user').textContent = MOCK_USER;
  qs('#profile-memory').textContent = MOCK_MEMORY;

  // Reset tabs
  qsa('.tab').forEach(t => t.classList.remove('active'));
  qsa('.pane').forEach(p => p.classList.remove('active'));
  const firstTab = qs('.tab[data-tab="identity"]');
  const firstPane = qs('.pane[data-pane="identity"]');
  if (firstTab && firstPane) {
    firstTab.classList.add('active');
    firstPane.classList.add('active');
    firstTab.setAttribute('aria-selected', 'true');
  }

  // Update title with selected agent
  const agent = AGENTS.find(a => a.id === agentId);
  qs('#profile-title').textContent = `Profile Viewer — ${agent ? agent.name : 'Agent'}`;

  const overlay = qs('#profile-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeProfileViewer() {
  const overlay = qs('#profile-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function wireProfileViewerShell() {
  qs('#profile-close').addEventListener('click', closeProfileViewer);
  qs('#profile-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'profile-overlay') closeProfileViewer();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProfileViewer();
  });

  qsa('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-tab');
      qsa('.tab').forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      qsa('.pane').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-pane') === key);
      });
    });
  });
}

window.addEventListener('hashchange', render);

wireProfileViewerShell();
render();
