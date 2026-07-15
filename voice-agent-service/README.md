# Heimdell voice agent service

Always-on WebSocket service for the conversational AI phone verification agent. Lives in this repo but deploys separately (Fly.io) from the main Next.js app (Netlify) -- see the plan doc for the full design.

## Status

Phases A-C are built: `/healthz`, the ConversationRelay WS handler, session bootstrap, the Claude-driven state machine for the full happy path (identity check through explicit agreement), and DB write-back (granular live ConsentEvents, certificate creation via the shared `completeVerificationSession()`). Not yet tested against a real Twilio call or deployed to production -- see the plan doc for the exact remaining verification steps before `VOICE_AGENT_ENABLED` gets set anywhere real. Phase D (the non-happy-path branches: wrong number, objections, DD mismatch, etc.) still needs individual real-call verification.

## Local dev

```
npm install
npm run dev        # tsx watch src/server.ts, listens on :8080
curl http://localhost:8080/healthz
```

## Why Fly.io

- Purpose-built for small always-on services like this (a WebSocket server) -- `min_machines_running = 1` / `auto_stop_machines = false` in `fly.toml` keeps it from scaling to zero, which would otherwise mean a real incoming call finds a cold/unreachable service.
- Deploys straight from the `Dockerfile` already in this folder.
- Handles HTTPS/`wss://` automatically on the `*.fly.dev` domain -- Twilio's ConversationRelay requires a real secure WebSocket URL, and Fly gives you one with zero extra setup (no separate reverse proxy/TLS cert step needed, unlike a plain VM).
- (We tried Oracle Cloud's free tier first, since it's genuinely free -- but its signup flow didn't cooperate, so we're back to Fly.io's small monthly cost, ~$2-5/month for the tiny machine this needs.)

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

`fly status` should show one machine in a `started` state persistently across repeated checks (not stopping between requests).

## Redeploying after code changes

Same `fly deploy` command as above -- re-run from repo root whenever `voice-agent-service/`, `prisma/schema.prisma`, or `src/lib/` (the shared modules it imports) change.

## Secrets (required from Phase C onward)

`config.ts` fails fast on boot if any of these besides `DATABASE_URL` are missing:
```
fly secrets set --config voice-agent-service/fly.toml --app heimdell-voice-agent \
  DATABASE_URL=... \
  TWILIO_ACCOUNT_SID=... \
  ANTHROPIC_API_KEY=... \
  APP_URL=https://telecomcompliance.uk
```

## Testing before a real call

```
npm run dev                                          # starts the service locally on :8080
npm run test:conversation -- --token <raw-token>      # drives a scripted happy-path conversation
```

The token must belong to a real `VerificationSession` you created first via the dashboard (New Verification, method "phone call") -- this script makes a real Claude call and real DB writes against whatever `DATABASE_URL`/`ANTHROPIC_API_KEY` your local `.env.local` points at, so point it at a dev database, not production, unless you mean to.
