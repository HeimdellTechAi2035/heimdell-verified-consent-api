# Heimdell voice agent service

Always-on WebSocket service for the conversational AI phone verification agent. Lives in this repo but deploys separately (an Oracle Cloud "Always Free" VM) from the main Next.js app (Netlify) -- see the plan doc for the full design.

## Status

Phases A-C are built: `/healthz`, the ConversationRelay WS handler, session bootstrap, the Claude-driven state machine for the full happy path (identity check through explicit agreement), and DB write-back (granular live ConsentEvents, certificate creation via the shared `completeVerificationSession()`). Not yet tested against a real Twilio call or deployed to production -- see the plan doc for the exact remaining verification steps before `VOICE_AGENT_ENABLED` gets set anywhere real. Phase D (the non-happy-path branches: wrong number, objections, DD mismatch, etc.) still needs individual real-call verification.

## Local dev

```
npm install
npm run dev        # tsx watch src/server.ts, listens on :8080
curl http://localhost:8080/healthz
```

## Why Oracle Cloud + Docker Compose + Caddy

- Oracle's "Always Free" tier gives a real, always-on VM (Ampere A1 ARM, 2 OCPU/12GB RAM as of mid-2026 -- far more than this needs) at no ongoing cost, unlike Fly.io/Render/Railway which all charge something for an always-on service.
- The same `Dockerfile` already in this folder runs unchanged on the VM's ARM64 architecture (Docker's official Node images are multi-arch) -- no rewrite needed there.
- `docker-compose.yml` runs two containers: this service, and [Caddy](https://caddyserver.com/) as a reverse proxy that automatically requests and renews a Let's Encrypt TLS certificate for the domain in `VOICE_AGENT_DOMAIN` -- Twilio's ConversationRelay requires a real `wss://` (secure WebSocket) URL, so this step isn't optional.

## First-time setup (all one-time, run these yourself -- needs your own Oracle Cloud account + a DNS record you control)

**1. Create the VM** (in the Oracle Cloud console, oracle.com/cloud/free):
- Compute → Instances → Create Instance.
- Image: Ubuntu (latest LTS). Shape: Ampere (ARM), "Always Free eligible" -- pick the free allowance (up to 2 OCPU / 12GB as of mid-2026; check the console for the current free limit, it was recently reduced).
- Add your SSH key during creation (or let Oracle generate one for you to download) -- you'll need it to log in.
- Note the VM's public IP once it's running.

**2. Open the right ports** -- Oracle blocks inbound traffic at *two* layers by default, both need opening:
- In the Oracle console: your VM's subnet → Security Lists → Add Ingress Rules for TCP 80 and TCP 443 (source `0.0.0.0/0`).
- On the VM itself (Ubuntu's default firewall): SSH in, then:
  ```
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save   # if installed; otherwise the rule won't survive a reboot
  ```

**3. Point a DNS record at it** -- add an `A` record for something like `voice-agent.telecomcompliance.uk` pointing at the VM's public IP, wherever telecomcompliance.uk's DNS is managed. Caddy (step 5) needs this to already resolve before it can get a certificate.

**4. Install Docker on the VM**:
```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to apply
```

**5. Get the code onto the VM and deploy**:
```
git clone https://github.com/HeimdellTechAi2035/heimdell-verified-consent-api.git
cd heimdell-verified-consent-api/voice-agent-service
cp .env.example .env
nano .env               # set VOICE_AGENT_DOMAIN to the real domain from step 3
chmod 600 .env
docker compose up -d --build
```

## Verify it's actually always-on and reachable over HTTPS

```
docker compose ps                       # both containers should show "running"
curl https://voice-agent.telecomcompliance.uk/healthz
```

Docker Compose's `restart: unless-stopped` on both containers means a VM reboot or a crashed process comes back on its own -- check this actually works by rebooting the VM once (`sudo reboot`) and re-running the curl above a minute later.

## Redeploying after code changes

```
cd heimdell-verified-consent-api
git pull
cd voice-agent-service
docker compose up -d --build
```

## Secrets (required from Phase C onward)

Add to the VM's `voice-agent-service/.env` (never committed) -- `config.ts` fails fast on boot if any of these besides `DATABASE_URL` are missing:
```
DATABASE_URL=...
TWILIO_ACCOUNT_SID=...
ANTHROPIC_API_KEY=...
APP_URL=https://telecomcompliance.uk
```
Then `docker compose up -d --build` again to pick them up.

## Testing before a real call

```
npm run dev                                          # starts the service locally on :8080
npm run test:conversation -- --token <raw-token>      # drives a scripted happy-path conversation
```

The token must belong to a real `VerificationSession` you created first via the dashboard (New Verification, method "phone call") -- this script makes a real Claude call and real DB writes against whatever `DATABASE_URL`/`ANTHROPIC_API_KEY` your local `.env.local` points at, so point it at a dev database, not production, unless you mean to.
