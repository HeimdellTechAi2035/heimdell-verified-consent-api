# Heimdell Verified Consent API

API-first compliance infrastructure for recording and certifying customer consent in regulated sales environments.

---

## What this is

A self-hosted Next.js API that provides:

- **Sale intake** — create a sale and issue a customer verification session
- **Verification flow** — customer reviews and accepts consent terms via a web page
- **Consent certificates** — immutable SHA-256 proof records generated at completion
- **Decline flow** — customer can reject, with reason logged
- **Notification foundation** — SMS / email delivery logs plus outbound webhook queueing
- **Webhook signing** — HMAC-SHA256 signed payloads for downstream systems
- **Webhook delivery worker** — finite batch worker for signed outbound CRM webhook POSTs
- **Dashboard shell** — Supabase-authenticated dashboard with live tenant-scoped overview, sales, verification, certificate list/detail, API key, and webhook delivery metadata
- **Production-safe CRM widget flow** — browser widget and iframe panels consume short-lived embed tokens only
- **Browser security controls** — route-aware CSP, frame protections, and configured CRM embed origins

---

## Quick start

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000`.

Health check (no database required):

```bash
npm run test:health
```

---

## Before live testing

A real PostgreSQL database must be connected before the API routes work end-to-end.

See **[DATABASE_SETUP.md](DATABASE_SETUP.md)** for:
- Supabase (recommended)
- Neon
- Local Docker Postgres
- Required setup commands
- Common errors and what not to do

See **[MIGRATIONS.md](MIGRATIONS.md)** for the database migration strategy, backup checklist, and production migration rules.

See **[DASHBOARD_SETUP.md](DASHBOARD_SETUP.md)** for mapping a Supabase Auth user to an internal organization membership and role.

See **[DEMO_RUNBOOK.md](DEMO_RUNBOOK.md)** for the local end-to-end demo sequence.

---

## API testing

See **[API_TESTING.md](API_TESTING.md)** for:
- Full curl command examples for every endpoint
- Test payloads in `test-payloads/`
- Expected responses
- Troubleshooting status codes

---

## CRM integration

See **[CRM_INTEGRATION.md](CRM_INTEGRATION.md)** for:
- How Heimdell fits inside an external CRM (Salesforce, HubSpot, Pipedrive, etc.)
- The full seller workflow and seller script
- API intake flow and response shape
- iframe embed, JavaScript widget, and native app options
- Required CRM fields (`hvcs_*`)
- Webhook writeback events and signature verification
- Security rules (server-side API calls only, no API keys in browser code)
- What the embed widget should and should not do
- Commercial positioning

---

## Project structure

```
src/
  app/
    api/v1/          — API routes (sales, verifications, certificates, webhooks)
    dashboard/       — Protected dashboard shell with tenant-scoped live pages and role-gated admin areas
    v/[token]/       — Customer-facing verification page
  lib/               — Crypto, validation, auth, notifications, webhooks, db
  types/             — Shared TypeScript types
prisma/
  schema.prisma      — Database schema
test-payloads/       — JSON payloads for manual API testing
scripts/             — Seed and key generation scripts
```

---

## Tech stack

- **Next.js 15** — App Router, TypeScript strict mode
- **Prisma 6** — PostgreSQL ORM
- **Zod** — Request body validation
- **bcryptjs** — API key hashing
- **Node.js crypto** — SHA-256 token hashing, AES-256-GCM encryption, HMAC-SHA256 webhook signing
- **nanoid** — Secure token generation
- **Tailwind CSS v3** — Styling

---

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Project scaffold | ✅ Complete |
| 2 | Sale intake endpoint | ✅ Complete |
| 3 | Verification session lookup + customer page | ✅ Complete |
| 4 | Consent completion flow | ✅ Complete |
| 5 | Decline flow | ✅ Complete |
| 6 | Certificate retrieval endpoint | ✅ Complete |
| 7 | Notification service foundation | ✅ Complete |
| 8 | Webhook delivery foundation | ✅ Complete |
| 9 | Dashboard shell | ✅ Complete |
| 10 | API test payloads and testing docs | ✅ Complete |
| 11 | Database connection preparation | ✅ Complete |
| 12A | Dashboard route scaffold | ✅ Complete |
| 12B | Dashboard UI component library | ✅ Complete |
| 12C | Dashboard page improvements | ✅ Complete |
| 12D | CRM embed widget components | ✅ Complete |
| 12E | CRM integration documentation | ✅ Complete |
| — | AES-256-GCM encryption (replaces placeholder base64) | Complete |
| — | Auth, tenants, and roles foundation | Complete |
| — | Prisma migrations and database safety | Complete |
| — | Rate limiting and public endpoint protection | Complete |
| — | Real dashboard auth provider foundation (Supabase Auth) | Complete |
| — | Dashboard access setup and page-level role gates | Complete |
| — | Live dashboard overview data | Complete |
| — | Live dashboard sales page | Complete |
| — | Live dashboard verifications page | Complete |
| — | Live dashboard certificates page | Complete |
| — | Protected certificate detail page | Complete |
| — | Protected PDF certificate export | Complete |
| — | Tenant-scoped API key management foundation | Complete |
| — | API auth compatibility upgrade (`ApiKey` + legacy `Client.apiKeyHash`) | Complete |
| — | Signed CRM embed tokens | Complete |
| — | Production CRM widget flow | Complete |
| — | Frame, CSP, and origin security foundation | Complete |
| — | SMS / email delivery (Twilio, SendGrid) | Pending |
| — | Durable webhook retry schema and worker upgrade | Complete |
| — | Live dashboard webhooks page | Complete |
| — | Client/staff provisioning and seller-owned sales | Complete |
| — | Protected PDF certificate export | Complete |

---

## Security notes

- `.env.local` is git-ignored — never commit secrets
- API keys are bcrypt-hashed in the database — raw keys are shown once only at seed time
- Verification tokens are SHA-256 hashed — raw tokens are sent to customers only
- Webhook payloads are HMAC-SHA256 signed
- Queued webhook notifications can be delivered with `npm run worker:webhooks`; use `npm run worker:webhooks -- --dry-run` to inspect safe counts without sending
- Webhook delivery sends safe event metadata only and excludes webhook secrets, raw API keys, hashes, raw tokens, full customer contact data, bank details, and full certificate JSON
- Webhook signing secrets generated or rotated from `/dashboard/integrations` are encrypted at rest with AES-256-GCM in the existing `Client.webhookSecret` compatibility field. Older plaintext demo rows remain readable for delivery but should be rotated to re-store them encrypted.
- Rate limiting supports a local in-memory fallback and a production shared Upstash Redis REST mode. Set `RATE_LIMIT_STORE=upstash`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` for multi-instance deployments.
- Webhook delivery now has additive retry fields on `Notification`: `attempts`, `maxAttempts`, `nextAttemptAt`, `lastAttemptAt`, `lastResponseStatus`, `lastSafeError`, `deliveredAt`, `terminalFailureAt`, and `deliveryId`
- Retry backoff is staged at 1 minute, 5 minutes, 15 minutes, 1 hour, and 6 hours. Deliveries stop at `maxAttempts`; terminal failures are not retried.
- Full bank account numbers are encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY`
- `ENCRYPTION_KEY` must be a base64-encoded 32-byte key generated with `npm run generate:encryption-key`
- Encrypted sensitive values use the format `v1:<iv>:<auth_tag>:<ciphertext>`
- Existing development rows created with the old base64 placeholder cannot be safely decrypted by the new helper; reset dev data if needed
- Auth/tenant/role models now exist in Prisma and dashboard auth uses Supabase Auth server-side sessions
- Dashboard page-level role gates are active; `/dashboard/overview`, `/dashboard/my-sales`, `/dashboard/sales`, `/dashboard/verifications`, `/dashboard/certificates`, `/dashboard/certificates/[id]`, `/dashboard/api-keys`, `/dashboard/staff`, `/dashboard/integrations`, and `/dashboard/webhooks` use protected tenant-scoped flows where implemented
- `/dashboard/webhooks` shows safe delivery metadata only; retry, detail, and endpoint edit actions are placeholders and do not mutate data yet
- `/dashboard/integrations` includes tenant-scoped webhook endpoint management using existing `Client.webhookUrl` and encrypted `Client.webhookSecret`; secrets are generated server-side and shown once only, while the dashboard displays only configured status and a short fingerprint
- Certificate detail is a protected evidence summary only; PDF download is protected, while email/share/export-all actions remain intentionally disabled
- Protected certificate PDF export is available at `/dashboard/certificates/[id]/pdf` for certificate-authorized dashboard roles only; it is a masked evidence summary, not a public link
- Notifications, client settings, billing, public signup, SMS/email delivery, MCP, and verification detail pages remain incomplete or intentionally disabled
- v1 server-to-server `x-api-key` authentication supports dashboard-managed `ApiKey` rows first, with legacy `Client.apiKeyHash` fallback preserved
- CRM embed status APIs require short-lived signed embed tokens issued by a trusted backend through `POST /api/v1/embed-tokens`
- `public/widget.js` renders safe CRM status using injected `embedToken`; it never uses server API keys in browser code
- `src/middleware.ts` applies route-aware CSP and frame controls. Dashboard, API, and `/v/[token]` routes are not intended to be framed; `/embed/*` may be framed only by origins configured in `ALLOWED_EMBED_ORIGINS`.
- Browser calls to embed status endpoints validate `Origin`/`Referer` when present. Signed embed tokens remain the primary authorization control because those headers are not a substitute for authentication.
- See `SECURITY.md` for the role matrix, tenant isolation rules, API key compatibility plan, and recommended auth provider options
- Public verification endpoints and API-key endpoints have in-memory rate limiting with safe 429 responses
- In-memory rate limiting is development-safe only; use Redis/Upstash or another shared store for multi-instance production
- Dashboard authentication uses Supabase Auth server-side sessions, mapped to internal `User.externalAuthId`
- Public self-serve dashboard signup is disabled; invite users in Supabase Auth and create matching internal `User` plus `OrganizationMembership` rows
- Use `npm run setup:dashboard-user` to create or update the internal dashboard user, organization membership, role, and optional development client link

## Deployment Domain, PWA, and Legal Footer

Production should run from `https://telecomcompliance.uk`. Set `APP_URL=https://telecomcompliance.uk` in production so verification links, Supabase auth callbacks, metadata, and security-header origin handling use the root domain. Do not hard-code localhost or a verification subdomain in production settings.

The app exposes a web app manifest for the PWA identity:

- App name: Heimdell Verified Consent
- Short name: Heimdell Verify
- Start URL and scope: `/`
- Display: standalone

Each Heimdell app/domain should have its own manifest identity, app name, icons, and production URL where needed. For this platform, the PWA identity is Heimdell Verified Consent at `https://telecomcompliance.uk`.

The shared app footer uses this legal text across public, login, dashboard, verification, widget, and embed HTML surfaces:

`© 2026 Heimdell Tech Ai Ltd. Registered in England & Wales. Company No. 16478408. ICO Reg: ZC079121.`

The app footer intentionally does not include a registered office address. PDFs keep their existing evidence-summary footer rather than duplicating the app footer.
