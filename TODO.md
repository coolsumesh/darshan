# TODO — Darshan

## 0) Project setup
- [ ] Confirm stack + repo layout
- [ ] Create minimal backend + web app skeleton
- [ ] Docker compose (Postgres + Redis)

## 1) Core data model
- [ ] Agents
- [ ] Threads
- [ ] Messages
- [ ] Runs
- [ ] A2A routes
- [ ] Audit log

## 2) Backend (API + realtime)
- [ ] REST: agents/threads/messages/runs
- [ ] WebSocket: message.created, run.updated, presence

## 3) UI (Dashboard)
- [ ] 3-pane layout (Agents | Conversation | Context)
- [ ] Thread list + search
- [ ] Message composer + streaming responses
- [ ] Broadcast to multiple agents

## 4) Agent connector
- [ ] Connect Darshan to Clawdbot agents for send/receive

## 5) Agent↔Agent
- [ ] Delegation flow + visibility controls
- [ ] A2A console view

## 6) Security
- [ ] Auth (MVP: token/basic/OIDC later)
- [ ] RBAC
- [ ] Rate limits + timeouts
