# Heimdell voice agent service

Always-on WebSocket service for the conversational AI phone verification agent. Lives in this repo but deploys separately (Fly.io) from the main Next.js app (Netlify) -- see the plan doc for the full design.

## Phase A status: scaffold only

Right now this is just a `/healthz` endpoint and a WebSocket echo handler, deployed to prove the always-on hosting works before any Twilio/Claude/DB wiring is added.

## Local dev

```
npm install
npm run dev        # tsx watch src/server.ts, listens on :8080
curl http://localhost:8080/healthz
```

## First-time Fly.io setup (run these yourself -- needs your own Fly.io account/auth)

```
# 1. install flyctl if you don't have it: https://fly.io/docs/flyctl/install/
fly auth login

# 2. from the REPO ROOT (not this directory):
fly apps create heimdell-voice-agent

# 3. deploy (also from repo root -- the Dockerfile needs ../prisma and ../src/lib as build context)
fly deploy . --config voice-agent-service/fly.toml --app heimdell-voice-agent
```

## Verify it's actually always-on (not scaled to zero)

```
fly status --config voice-agent-service/fly.toml --app heimdell-voice-agent
curl https://heimdell-voice-agent.fly.dev/healthz
```

`fly status` should show one machine in a `started` state persistently across repeated checks (not stopping between requests) -- `fly.toml` sets `min_machines_running = 1` / `auto_stop_machines = false` specifically so it never scales to zero, which would otherwise mean a real customer's incoming call finds a cold/unreachable service.

## Redeploying after code changes

Same `fly deploy` command as above -- re-run from repo root whenever `voice-agent-service/`, `prisma/schema.prisma`, or `src/lib/` (the shared modules it imports) change.

## Secrets (added starting Phase C, not needed yet)

```
fly secrets set --config voice-agent-service/fly.toml --app heimdell-voice-agent \
  DATABASE_URL=... \
  TWILIO_ACCOUNT_SID=... \
  TWILIO_AUTH_TOKEN=... \
  ANTHROPIC_API_KEY=... \
  APP_URL=https://telecomcompliance.uk
```
