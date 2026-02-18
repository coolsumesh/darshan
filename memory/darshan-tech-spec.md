# Darshan Hub — Technical Specification (Memory)

## Stack
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS
- Package manager: pnpm (monorepo)
- Infra: AWS EC2 (ubuntu) — same server as Mithran agent
- Domain: darshan.caringgems.in (GoDaddy DNS → AWS public IP: 3.149.9.241)
- SSL: Let's Encrypt via certbot
- Reverse proxy: nginx (darshan.caringgems.in → 127.0.0.1:3000)
- Process manager: PM2 (darshan-web on port 3000, darshan-api on port 4000)

## Repo
- GitHub: https://github.com/coolsumesh/darshan
- Branch: main (production)
- Clone path on server: /home/ubuntu/.openclaw/workspace/projects/darshan

## Deployment
- Auto-deploy: GitHub Actions on push to main
- Workflow: .github/workflows/deploy.yml
- Deploy script: /home/ubuntu/deploy-darshan.sh
- Steps: git pull → pnpm install → pnpm build → pm2 restart darshan-web

## GitHub Secrets required
- DEPLOY_HOST: 3.149.9.241
- DEPLOY_USER: ubuntu
- DEPLOY_SSH_KEY: (ed25519 private key at /home/ubuntu/.ssh/darshan_deploy)

## API Endpoints
- GET  /api/v1/projects
- GET  /api/v1/projects/:id/architecture
- GET  /api/v1/projects/:id/tech-spec
- GET  /api/v1/projects/:id/tasks
- POST /api/v1/projects/:id/tasks
- PATCH /api/v1/projects/:id/tasks/:taskId
- GET  /api/v1/projects/:id/team
- POST /api/v1/projects/:id/team
- GET  /api/v1/agents
