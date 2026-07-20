# Heimdell voice agent service

Always-on WebSocket service for the conversational AI phone verification agent. Lives in this repo but deploys separately (Railway) from the main Next.js app (Netlify) -- see the plan doc for the full design.

## Status

Phases A-C are built and **deployed and healthy on Railway** (`heimdell-voice-agent-production.up.railway.app`): `/healthz`, the ConversationRelay WS handler, session bootstrap, the Claude-driven state machine for the full happy path (identity check through explicit agreement), and DB write-back (granular live ConsentEvents, certificate creation via the shared `completeVerificationSession()`). Not yet tested against a real Twilio call -- see the plan doc for the exact remaining verification steps before `VOICE_AGENT_ENABLED` gets set anywhere real. Phase D (the non-happy-path branches: wrong number, objections, DD mismatch, etc.) still needs individual real-call verification.

## Local dev

```
npm install
npm run dev        # tsx watch src/server.ts, listens on :8080
curl http://localhost:8080/healthz
```

## Why Railway

Two other hosts were tried first and didn't work out: Oracle Cloud's genuinely-free "Always Free" tier had a signup flow that wouldn't cooperate, and Fly.io's remote builder silently stalled on a brand-new account (payment method was on file; likely a fraud-prevention hold, never resolved). Railway worked. Costs a few $/month for an always-on service at this size.

`railway.json` at the repo root configures the build (`voice-agent-service/Dockerfile`, same Dockerfile used for the other hosts -- portable) and a `/healthz` healthcheck.

## First-time Railway setup (run these yourself -- needs your own Railway account)

```
npm install -g @railway/cli
railway login              # opens a browser

# from the REPO ROOT:
railway init --name heimdell-voice-agent
railway up -c --service heimdell-voice-agent
railway domain --service heimdell-voice-agent    # generates the public URL
```

## A real bug hit during this deploy, worth knowing about

The build script originally used `esbuild --packages=external`, which (wrongly) also excluded our own `@/lib/*` path-aliased source files from bundling, not just real npm packages -- this only broke at *runtime* (`Cannot find package '@/lib'`), since the build itself never errored. Separately, even after switching to explicit `--external:<package>` flags, esbuild's automatic per-file tsconfig discovery meant it was **silently succeeding locally by accident** (finding the *main app's* root `tsconfig.json`, which happens to define the same `@/` alias) while genuinely failing on Railway, where that root tsconfig is never copied into the Docker build. Fixed by passing `--tsconfig=tsconfig.json` explicitly to force voice-agent-service's own tsconfig to apply everywhere, verified by temporarily hiding the root tsconfig locally and confirming the build still succeeds. **Lesson: a clean local build is not proof a Docker build will succeed** if the local environment has extra files context that won't exist in the container.

## Verify it's live and always-on

```
curl https://heimdell-voice-agent-production.up.railway.app/healthz
```

## Redeploying after code changes

```
railway up -c --service heimdell-voice-agent
```
(Run from the repo root -- the Dockerfile needs `../prisma` and `../src/lib` as build context.)

## Secrets (required from Phase C onward)

Set via the Railway dashboard (service -> Variables tab) or CLI -- `config.ts` fails fast on boot if any of these besides `DATABASE_URL` are missing:
```
DATABASE_URL       # use the DIRECT_URL (session pooler, port 5432) value from the main app's
                    # .env.local, NOT its DATABASE_URL (transaction pooler) -- this is a
                    # persistent process, not serverless, so it wants the session pooler.
TWILIO_ACCOUNT_SID  # from Netlify's env vars (not stored in the main app's .env.local)
ANTHROPIC_API_KEY
APP_URL             # https://telecomcompliance.uk
```
Also needs the same `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/
`NOTIFICATION_EMAIL_FROM` variables as the main app (see root `.env.example`) --
`terminal-outcomes.ts` sends the customer completion email through the exact same
shared `src/lib/notifications.ts` code path, whether the call was completed via the
web link or this phone agent.

## Dependency drift risk (shared src/lib/* code, two separate builds)

This service imports plain TS from the main app's `src/lib/*` (e.g. `notifications.ts`,
`notification-providers.ts`), bundled here with esbuild using an explicit
`--external:<package>` list in `package.json`'s `build` script -- unlike the main
app's Next.js/webpack build, esbuild does NOT resolve this service's own dependency
graph against the *main app's* `package.json`. If a future change to shared
`src/lib/*` code adds a new real npm dependency there, it must ALSO be added to
`voice-agent-service/package.json`'s `dependencies` AND to that `--external:` list,
or the build here breaks -- either loudly (module not found) or, worse, quietly by
picking up a hoisted copy from the root `node_modules` that isn't actually a
declared dependency of this service, which then breaks on the next clean install
with no compile-time warning. CI now builds this service in its own isolated
`npm ci` (`.github/workflows/ci.yml`, `voice-agent-service` job) specifically to
catch this at merge time instead of on a live call.

## Testing before a real call

```
npm run dev                                          # starts the service locally on :8080
npm run test:conversation -- --token <raw-token>      # drives a scripted happy-path conversation
```

The token must belong to a real `VerificationSession` you created first via the dashboard (New Verification, method "phone call") -- this script makes a real Claude call and real DB writes against whatever `DATABASE_URL`/`ANTHROPIC_API_KEY` your local `.env.local` points at, so point it at a dev database, not production, unless you mean to.
