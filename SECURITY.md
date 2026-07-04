# Security Notes

For a local demo checklist that avoids real customer data and secrets, see `DEMO_RUNBOOK.md`.

## Authentication status

Dashboard authentication now uses Supabase Auth as the provider foundation. The current auth foundation adds:

- `User`
- `Organization`
- `OrganizationMembership`
- `Role`
- `ApiKey`
- `AuditLog`
- server-side Supabase session checks
- internal user mapping through `User.externalAuthId`
- fail-closed server-side permission helpers
- server-rendered dashboard lock messaging

Dashboard access states:

- unauthenticated: redirected to `/login`
- authenticated Supabase user without internal `User.externalAuthId` mapping: blocked
- authenticated internal user without `OrganizationMembership`: blocked
- authenticated internal user with organization membership: dashboard shell renders only the sections allowed by that user's role
- insufficient role: page-level role gates show a safe access denied panel

Dashboard database queries must stay behind explicit tenant-scoped helpers and role checks.

Live protected sections include:

- `/dashboard/overview` loads live aggregate metrics and safe recent verification activity for the authenticated organization only.
- `/dashboard/sales` loads live paginated sales rows for the authenticated organization only.
- `/dashboard/verifications` loads live paginated verification session rows for the authenticated organization only.
- `/dashboard/certificates` loads live paginated certificate metadata for the authenticated organization only.
- `/dashboard/certificates/[id]` loads a protected tenant-scoped certificate evidence summary for certificate-authorized roles only.
- `/dashboard/api-keys` loads live paginated `ApiKey` metadata for the authenticated organization only and allows OWNER/ADMIN users to create or revoke dashboard-managed keys.
- `/dashboard/webhooks` loads live paginated webhook delivery metadata for OWNER/ADMIN users only.

These pages scope through `Client.organizationId` or direct `ApiKey.organizationId` and do not return full certificate JSON, raw tokens, raw verification URLs, hashes, raw API keys, API key hashes, encrypted account numbers, full IP addresses, full user-agent strings, full customer contact details, customer addresses, webhook secrets, or full bank/payment details.

Webhook dashboard rows show delivery IDs, event type, status, sale/client reference, latest verification/certificate IDs, retry counters, due/attempt timestamps, safe response status/error, delivery/terminal timestamps, creation timestamp, and destination hostname only. They do not expose full webhook URLs, secrets, payloads, raw headers, customer PII, payment data, tokens, hashes, or certificate JSON. Retry/edit/detail buttons are placeholders until a separate mutation phase.

Webhook endpoint management lives on `/dashboard/integrations` and uses the existing `Client.webhookUrl` and `Client.webhookSecret` fields for compatibility with the existing queue, test endpoint, and delivery worker. OWNER and ADMIN users can save/disable endpoints and regenerate secrets. MANAGER users may view safe metadata through the integrations page role policy, while SELLER and COMPLIANCE_VIEWER cannot access the integrations section.

New or rotated webhook secrets are stored encrypted with AES-256-GCM using the shared `ENCRYPTION_KEY` helper format `v1:<iv>:<auth_tag>:<ciphertext>`. Existing plaintext development rows are treated as legacy-compatible for signing so webhook delivery is not broken, but they should be rotated from `/dashboard/integrations` or migrated with a safe non-destructive script before production use.

The endpoint list shows client ID/name, destination hostname only, enabled/disabled status, creation/update timestamps, last success/failure timestamps, whether a signing secret is configured, and a short `whsec_...<fingerprint>` display value only. It never returns raw webhook secrets, encrypted secret blobs, full URLs, raw payloads, raw headers, customer data, payment data, tokens, hashes, or certificate JSON.

Webhook secrets are generated server-side and shown once after creation or regeneration. They are not logged. The webhook test endpoint signs a safe preview payload using the configured secret but does not return the secret, raw headers, full webhook URL, or encrypted storage value.

Certificate detail pages do not dump raw `certificateJson`. They map selected evidence fields into structured sections: verification outcome, sale details, consent confirmations, terms acknowledged, masked payment summary, timeline, and integrity fingerprint. Export/download/email actions remain disabled until a separate protected export phase.

Protected certificate PDF export is available only at dashboard route `/dashboard/certificates/[id]/pdf` for `OWNER`, `ADMIN`, `MANAGER`, and `COMPLIANCE_VIEWER`. It uses the same tenant-scoped certificate detail helper and the same safe evidence model. The response is `application/pdf`, uses a certificate-ID-only filename, sets `Cache-Control: no-store, private`, and does not create public PDF URLs.

The PDF includes Heimdell branding, certificate/sale/session identifiers, status, product and price summary, terms/policies/cooling-off summaries, confirmation answers, masked payment summary, safe timeline, and integrity fingerprint. It does not include raw certificate JSON, customer contact details, customer address, full IP/user-agent, token/hash fields, raw URLs, API keys, webhook secrets, or full bank/payment details. The footer states the PDF is an evidence summary and not legal advice.

## Roles

Supported roles:

- `OWNER`
- `ADMIN`
- `MANAGER`
- `SELLER`
- `COMPLIANCE_VIEWER`

Initial permission policy:

| Role | View certificates | Create verification | Manage API keys | Manage webhooks |
|---|---:|---:|---:|---:|
| `OWNER` | Yes | Yes | Yes | Yes |
| `ADMIN` | Yes | Yes | Yes | Yes |
| `MANAGER` | Yes | Yes | No | No |
| `SELLER` | No | Yes | No | No |
| `COMPLIANCE_VIEWER` | Yes | No | No | No |

No helper should default to allow. Unknown, missing, or unauthenticated access must fail closed.

## Dashboard page gates

Page-level dashboard gates are active across dashboard sections:

| Section | Allowed roles |
|---|---|
| overview | `OWNER`, `ADMIN`, `MANAGER`, `SELLER`, `COMPLIANCE_VIEWER` |
| sales | `OWNER`, `ADMIN`, `MANAGER`, `SELLER`, `COMPLIANCE_VIEWER` |
| verifications | `OWNER`, `ADMIN`, `MANAGER`, `SELLER`, `COMPLIANCE_VIEWER` |
| certificates | `OWNER`, `ADMIN`, `MANAGER`, `COMPLIANCE_VIEWER` |
| clients | `OWNER`, `ADMIN` |
| api-keys | `OWNER`, `ADMIN` |
| webhooks | `OWNER`, `ADMIN` |
| settings | `OWNER`, `ADMIN` |
| integrations | `OWNER`, `ADMIN`, `MANAGER` |
| notifications | `OWNER`, `ADMIN`, `MANAGER` |

The role matrix lives in `src/lib/dashboard-role-policy.ts`. Unknown sections return no allowed roles.

## Tenant isolation

Future dashboard queries should continue to scope records through `OrganizationMembership` and `Client.organizationId`. Use the helper patterns in `src/lib/tenant-scope.ts` for sales, verification sessions, and certificates.

Do not wire new dashboard live data until:

- the route uses server-side Supabase dashboard auth
- authenticated users map to internal `User` records
- access is based on `OrganizationMembership`
- every live dashboard query includes an organization boundary
- audit logging is added around admin actions

Overview, my-sales, sales, verifications, certificate list/detail/PDF, API keys, staff, integrations/webhook settings, webhooks, credits, and signups already have protected flows. Notifications, client settings, SMS/email delivery, MCP, and verification detail pages remain incomplete or intentionally disabled.

## API keys

`Client.apiKeyHash` remains in place as a legacy fallback for the v1 API authentication path. This preserves existing sale intake integrations while dashboard-managed `ApiKey` rows are introduced.

The `ApiKey` model is now used by `/dashboard/api-keys` for tenant-scoped key metadata, creation, and revocation. v1 `x-api-key` authentication now checks active, unexpired `ApiKey` rows first, then falls back to legacy active `Client.apiKeyHash` records. Raw API keys are shown once only after creation and must never be stored. Only prefixes and bcrypt hashes are persisted.

Recommended compatibility plan:

1. Keep `Client.apiKeyHash` active for existing integrations.
2. Use dashboard-managed key creation/revocation through `ApiKey`.
3. Authenticate v1 API calls against active, unexpired `ApiKey` rows first, then legacy `Client.apiKeyHash`.
4. Rotate existing clients onto `ApiKey`.
5. Remove or deprecate `Client.apiKeyHash` only after all clients have migrated.

Revocation sets `ApiKey.status` to `REVOKED` and preserves history. It does not hard-delete key metadata.

Organization-level `ApiKey` rows can retrieve organization-scoped certificates. Sale intake and webhook testing require a client-linked key because those flows need client-specific sale ownership and webhook configuration.

## Supabase Auth setup

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Never expose the Supabase service-role key in browser code. This app does not need the service-role key for dashboard sessions.

Recommended setup:

1. Configure Supabase Auth email login or magic links.
2. Public self-serve organization signup is now approved and live at `/signup` (see `CLIENT_ONBOARDING_FLOW.md`) — every submission requires explicit Platform Admin approval at `/dashboard/signups` before any Supabase Auth user, `Client`, or `OrganizationMembership` is created, and no login is emailed until approval. Staff can still invite/admin-create users directly for cases that should bypass the public form.
3. Invite or admin-create dashboard users in Supabase for the manual path.
4. Apply the migration that adds `User.externalAuthId`.
5. Create an internal `User` row where `externalAuthId` equals the Supabase auth user ID.
6. Create at least one `OrganizationMembership` row for that internal user.

Use `npm run setup:dashboard-user` for local/admin setup. See `DASHBOARD_SETUP.md`.

## Auth provider notes

Reasonable options for the dashboard:

- Supabase Auth if the project standardizes on Supabase
- Auth.js / NextAuth with email or OAuth
- Clerk for hosted organization/user management
- WorkOS if enterprise SSO becomes important

Supabase Auth was chosen because the project already recommends Supabase/PostgreSQL and `@supabase/ssr` supports server-side session validation in the Next.js App Router. Client-side checks alone are not sufficient.

## Sensitive values

Never expose or log:

- raw API keys
- `apiKeyHash`
- raw verification tokens
- `tokenHash`
- `encryptedAccountNumber`
- full bank account numbers
- webhook secrets

Only `accountNumberLast4` should be used for display.

## CRM embed tokens

CRM browser embeds must not use `x-api-key`. A trusted client backend should call `POST /api/v1/embed-tokens` with its server-side API key, then inject the returned short-lived token into the iframe or widget.

Embed token claims include:

- `scope`: `verification_status` or `deal_status`
- `organizationId`
- optional `clientId`
- `targetId`
- `issuedAt`
- `expiresAt`
- `jti`

Tokens are HMAC-SHA256 signed with `EMBED_TOKEN_SECRET`, which must be server-only and at least 32 characters. Embed status endpoints validate signature, expiry, scope, target, and tenant ownership before returning safe status fields.

The public widget accepts `embedToken`, `mode`, and `targetId` configuration only. It rejects browser API key configuration, does not log token values, and renders only status, reference, product, safe timestamps, and certificate ID.

## Outbound webhook delivery

Queued or retryable `Notification` rows with `channel=WEBHOOK` are processed by `src/lib/webhook-delivery.ts` and the finite CLI worker `npm run worker:webhooks`.

The worker rebuilds payloads from sale, client, verification session, and certificate metadata at delivery time. It sends HTTPS POST requests with:

- `Content-Type: application/json`
- `User-Agent: Heimdell-Webhook/1.0`
- `X-Heimdell-Signature`
- `X-HVCS-Signature` for compatibility with existing docs/integrations
- `X-Heimdell-Event-Type`
- `X-Heimdell-Delivery-Id`

Payloads include event type, delivery/event IDs, client ID, sale ID, client reference, verification session ID, verification status, sale status, certificate ID when available, safe product name, and timestamps.

Payloads must not include webhook secrets, raw API keys, API key hashes, raw verification tokens, token hashes, raw verification URLs, encrypted account numbers, bank/payment details, customer address, full customer phone/email, full certificate JSON, full IP address, or full user-agent.

Durable retry tracking lives on `Notification`: `attempts`, `maxAttempts`, `nextAttemptAt`, `lastAttemptAt`, `lastResponseStatus`, `lastSafeError`, `deliveredAt`, `terminalFailureAt`, and `deliveryId`.

Retry behavior:

- `2xx` responses mark the row `SENT` and set `deliveredAt`.
- Transient failures such as timeout/network errors, `408`, `425`, `429`, and `5xx` responses are retried until `maxAttempts`.
- Backoff uses staged delays of 1 minute, 5 minutes, 15 minutes, 1 hour, and 6 hours.
- Invalid webhook configuration, non-HTTPS production URLs, missing secrets, malformed payload state, and exhausted attempts are terminal failures.
- Terminal failures are marked `FAILED` with `terminalFailureAt`; they are not retried by the worker.

Worker output is limited to summary counts. It must not print payloads, webhook secrets, raw API keys, tokens, customer contact data, payment data, or full certificate JSON.

## Frame, CSP, and embed origins

`src/middleware.ts` applies route-aware browser security headers:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security` on HTTPS requests

Dashboard routes, API routes, and customer verification pages are not intended to be framed. Their CSP `frame-ancestors` policy blocks framing by default, and non-embed routes also receive `X-Frame-Options: SAMEORIGIN`.

CRM iframe surfaces under `/embed/*` do not receive `X-Frame-Options` because that would block trusted CRM embeds. Instead, `/embed/*` uses CSP `frame-ancestors` built from `APP_URL` and `ALLOWED_EMBED_ORIGINS` or `CRM_ALLOWED_ORIGINS`. Configure only trusted HTTPS CRM origins in production.

Embed status API requests validate browser `Origin` or `Referer` when present. Missing browser origin headers are allowed for server-to-server compatibility, so this check is an abuse-control layer, not authentication. Signed short-lived embed tokens remain required for every live embed status response.

## Rate limiting

The app includes a fixed-window rate limiter for abuse protection on public bearer-token endpoints, API-key endpoints, and CRM embed status endpoints. Local development can use the in-memory store; production multi-instance deployments should use the shared Upstash Redis REST store.

Protected areas:

- `GET /api/v1/verification-sessions/[token]`
- `POST /api/v1/verification-sessions/[token]/complete`
- `POST /api/v1/verification-sessions/[token]/decline`
- `POST /api/v1/sales/intake`
- `GET /api/v1/certificates/[id]`
- `POST /api/v1/webhooks/test`
- `POST /api/v1/embed-tokens`
- `GET /api/v1/embed/verification/[sessionId]/status`
- `GET /api/v1/embed/deal/[clientReference]/status`
- `/v/[token]` page-level session lookup path

Rate-limit keys use operational IP, route/action name, safe token/session/embed-token fingerprints, and client/organization IDs where available. Raw verification tokens, raw signed embed tokens, and raw API keys are never stored in limiter keys or logs.

Store configuration:

- `RATE_LIMIT_STORE=memory` uses the local in-memory fallback. This is suitable for development and single-process testing only.
- `RATE_LIMIT_STORE=upstash` uses Upstash Redis REST as the shared production store. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- If `RATE_LIMIT_STORE` is omitted and Upstash credentials are present, Upstash is used automatically. Otherwise the app falls back to memory.
- Shared limiter failures fail closed by default and return safe HTTP `429` responses without revealing token existence. `RATE_LIMIT_FAIL_OPEN=true` is available only for deliberate temporary incident response.

Current policies:

| Policy | Limit | Window | Used for |
|---|---:|---:|---|
| `public_token_lookup` | 30 | 60s | customer token lookup and `/v/[token]` page loads |
| `public_token_submit` | 8 | 60s | complete/decline submissions |
| `invalid_token_attempt` | 12 | 60s | invalid token attempts |
| `api_key_pre_auth` | 60 | 60s | API-key routes before client authentication |
| `api_key_authenticated` | 120 | 60s | API-key routes after client authentication |
| `embed_status` | 120 | 60s | signed CRM embed status endpoints |

The limiter returns HTTP `429` with a safe JSON body and `Retry-After` header for API routes. It does not reveal whether a verification token exists when rate-limited.

Production limitation: in-memory limits are per Node.js process and are not enough for multi-instance deployments, serverless horizontal scaling, or distributed abuse. Use Upstash Redis REST or another shared low-latency store before production traffic.

Proxy note: request IP uses common headers such as `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, and `x-vercel-forwarded-for` as operational signals. Configure trusted proxy behavior at the hosting/network layer; these headers are not strong identity.

Do not include raw API keys, embed tokens, webhook secrets, customer data, or payment details in origin configuration, CSP values, logs, or browser widget configuration.

Production root domain: configure `APP_URL=https://telecomcompliance.uk`. The same root domain should be used for Supabase dashboard auth callbacks, generated verification links, app metadata, and PWA install checks. Trusted CRM origins remain explicit through `ALLOWED_EMBED_ORIGINS` or `CRM_ALLOWED_ORIGINS`; the signed embed token is still the primary authorization control.

The shared HTML app footer displays the no-address legal notice:

`© 2026 Heimdell Tech Ai Ltd. Registered in England & Wales. Company No. 16478408. ICO Reg: ZC079121.`
