# Heimdell Verified Consent API — Developer Testing Guide

Manual API testing reference for the full verification flow.  
All tests assume the dev server is running on `http://localhost:3000`.

For the full local dashboard/API/widget demo loop, see `DEMO_RUNBOOK.md`.

---

## 1. Start the dev server

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

---

## 2. Health check

Verify the server is running:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{ "ok": true, "service": "Heimdell Verified Consent API" }
```

No database or API key required for the health check.

---

## 3. Database requirement

> **Live API testing requires a real PostgreSQL database.**

The `.env.local` file ships with a placeholder `DATABASE_URL`. Until you replace it with a real connection string (Supabase, Neon, or local Postgres), all API routes that touch the database will return a 500 or connection error.

The health check (`/api/health`) is the only route that can return a meaningful response without a database. The webhook test preview (`/api/v1/webhooks/test`) requires API-key authentication and therefore needs database-backed client/key records.

---

## 4. Connect a database

Once you have a PostgreSQL connection string, update `.env.local`:

```
DATABASE_URL="postgresql://user:password@host:5432/heimdell_consent"
```

Then run these commands **in order**:

```bash
# 1. Regenerate the Prisma client
npx prisma generate

# 2. Apply local development migrations
npm run db:migrate:dev

# 3. Create or confirm a client-linked API key from /dashboard/api-keys
```

---

## 5. Save the dev API key

Dashboard-managed API keys are shown once only and are not stored anywhere in plain text. Copy the raw key immediately after creation.

Compatibility note: v1 API endpoints now authenticate `x-api-key` against active, unexpired dashboard-managed `ApiKey` rows first, then fall back to the legacy `Client.apiKeyHash` path created by `npm run seed:dev-client`. Existing dev keys continue to work. Dashboard-created keys are shown once only; store the raw key immediately because only the bcrypt hash and safe prefix are persisted.

Sale intake and webhook testing require a key linked to a `Client`. Organization-level `ApiKey` rows without `clientId` are rejected for those flows because there is no client-specific sale or webhook context.

**macOS / Linux / Git Bash:**
```bash
export HVCS_API_KEY="hvcs_dev_..."
```

**Windows PowerShell:**
```powershell
$env:HVCS_API_KEY="hvcs_dev_..."
```

All subsequent curl commands in this guide use `$HVCS_API_KEY` (or `$env:HVCS_API_KEY` on PowerShell — substitute manually if your shell doesn't expand environment variables in curl arguments).

---

## 6. Test sale intake — valid payload

```bash
curl -X POST http://localhost:3000/api/v1/sales/intake \
  -H "Content-Type: application/json" \
  -H "x-api-key: $HVCS_API_KEY" \
  --data @test-payloads/sale-intake.valid.json
```

**Windows PowerShell:**
```powershell
curl.exe -X POST http://localhost:3000/api/v1/sales/intake `
  -H "Content-Type: application/json" `
  -H "x-api-key: $env:HVCS_API_KEY" `
  --data "@test-payloads/sale-intake.valid.json"
```

**Expected response (201):**

```json
{
  "ok": true,
  "sale_id": "...",
  "verification_session_id": "...",
  "verification_url": "http://localhost:3000/v/<token>",
  "status": "PENDING",
  "expires_at": "2026-05-21T14:00:00.000Z"
}
```

Save the `verification_url` and extract the `<token>` — you need it for the next steps.

```bash
# Save the token manually after running the intake command:
export HVCS_TOKEN="<paste-token-here>"
```

**Windows PowerShell:**
```powershell
$env:HVCS_TOKEN="<paste-token-here>"
```

---

## 7. Test sale intake — invalid payload (missing fields)

```bash
curl -X POST http://localhost:3000/api/v1/sales/intake \
  -H "Content-Type: application/json" \
  -H "x-api-key: $HVCS_API_KEY" \
  --data @test-payloads/sale-intake.invalid-missing-fields.json
```

**Expected response (400):**

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request payload",
    "details": {
      "formErrors": [],
      "fieldErrors": { "client_reference": ["client_reference is required"], "..." : ["..."] }
    }
  }
}
```

The `details.fieldErrors` object maps each failing field to its error messages (Zod format).

---

## 8. Test verification session lookup

Open the `verification_url` directly in a browser to see the customer-facing consent form.

Or query the API directly:

```bash
curl http://localhost:3000/api/v1/verification-sessions/$HVCS_TOKEN
```

**Windows PowerShell:**
```powershell
curl.exe http://localhost:3000/api/v1/verification-sessions/$env:HVCS_TOKEN
```

**Expected response (200):**

```json
{
  "ok": true,
  "verification_session_id": "...",
  "sale_id": "...",
  "status": "PENDING",
  "expires_at": "...",
  "opened_at": null,
  "customer": { "full_name": "Jane Smith", "phone": "...", "email": null, "address": null },
  "product": { "name": "...", "subscription_price": "...", "subscription_frequency": "...", "subscription_terms_summary": "...", "policies_summary": "..." },
  "direct_debit": { "bank_name": "...", "sort_code": "...", "account_number_last4": "...", "account_holder_name": "..." }
}
```

---

## 9. Test complete verification

```bash
curl -X POST http://localhost:3000/api/v1/verification-sessions/$HVCS_TOKEN/complete \
  -H "Content-Type: application/json" \
  --data @test-payloads/complete-verification.valid.json
```

**Windows PowerShell:**
```powershell
curl.exe -X POST http://localhost:3000/api/v1/verification-sessions/$env:HVCS_TOKEN/complete `
  -H "Content-Type: application/json" `
  --data "@test-payloads/complete-verification.valid.json"
```

**Expected response (200):**

```json
{
  "ok": true,
  "status": "COMPLETED",
  "verification_session_id": "...",
  "sale_id": "...",
  "certificate_id": "...",
  "completed_at": "2026-05-20T14:08:00.000Z",
  "message": "Verification completed successfully"
}
```

Save the `certificate_id`:

```bash
export HVCS_CERT_ID="<paste-certificate-id-here>"
```

**Windows PowerShell:**
```powershell
$env:HVCS_CERT_ID="<paste-certificate-id-here>"
```

### Name mismatch test

Submit `complete-verification.name-mismatch.json` (typed_name is "John Smith" instead of "Jane Smith"):

```bash
curl -X POST http://localhost:3000/api/v1/verification-sessions/$HVCS_TOKEN/complete \
  -H "Content-Type: application/json" \
  --data @test-payloads/complete-verification.name-mismatch.json
```

**Expected response (400):** Typed name does not match the customer name on record.

---

## 10. Test certificate retrieval

```bash
curl http://localhost:3000/api/v1/certificates/$HVCS_CERT_ID \
  -H "x-api-key: $HVCS_API_KEY"
```

**Windows PowerShell:**
```powershell
curl.exe http://localhost:3000/api/v1/certificates/$env:HVCS_CERT_ID `
  -H "x-api-key: $env:HVCS_API_KEY"
```

**Expected response (200):**

```json
{
  "ok": true,
  "certificate_id": "...",
  "verification_session_id": "...",
  "sale_id": "...",
  "client_reference": null,
  "status": "COMPLETED",
  "created_at": "...",
  "proof_hash": "...",
  "certificate": { ... }
}
```

The `proof_hash` is a SHA-256 digest of the canonical certificate payload — used for tamper evidence.

---

## 11. Test decline verification

> A session that has already been completed **cannot** be declined — it returns 409.  
> To test decline, create a **new** sale first (repeat Step 6) and use the new token.

```bash
# First create a new sale and save the new token as HVCS_TOKEN
export HVCS_TOKEN="<new-token>"

# Then decline it:
curl -X POST http://localhost:3000/api/v1/verification-sessions/$HVCS_TOKEN/decline \
  -H "Content-Type: application/json" \
  --data @test-payloads/decline-verification.valid.json
```

**Windows PowerShell:**
```powershell
$env:HVCS_TOKEN="<new-token>"

curl.exe -X POST http://localhost:3000/api/v1/verification-sessions/$env:HVCS_TOKEN/decline `
  -H "Content-Type: application/json" `
  --data "@test-payloads/decline-verification.valid.json"
```

**Expected response (200):**

```json
{
  "ok": true,
  "status": "DECLINED",
  "verification_session_id": "...",
  "sale_id": "...",
  "declined_at": "...",
  "message": "Verification declined"
}
```

Calling decline again on the same token returns the same 200 (idempotent).  
Calling decline on an expired token returns 410.

---

## 12. Test webhook preview

This route does not send an external HTTP request — it returns a signed preview of what would be delivered to your webhook URL.

```bash
curl -X POST http://localhost:3000/api/v1/webhooks/test \
  -H "x-api-key: $HVCS_API_KEY"
```

**Windows PowerShell:**
```powershell
curl.exe -X POST http://localhost:3000/api/v1/webhooks/test `
  -H "x-api-key: $env:HVCS_API_KEY"
```

**Expected response (200):**

```json
{
  "ok": true,
  "event": "webhook.test",
  "payload": { ... },
  "signature_header": "sha256=...",
  "note": "..."
}
```

If no webhook signing secret is configured on your dev client, `signature_header` will be `null`. Configure or rotate the endpoint from `/dashboard/integrations`; do not manually paste secrets into API responses or browser code.

---

## 13. Run webhook delivery worker

Completed, declined, certificate-created, and link-created events queue `WEBHOOK` notification records when the client has a webhook URL configured. The worker processes a finite batch of due records and exits.

Start the safe local receiver in a second terminal when testing localhost delivery:

```bash
npm run webhook:receiver
```

Dry run, no outbound HTTP:

```bash
npm run webhook:worker -- --dry-run
```

Deliver up to 10 queued webhooks:

```bash
npm run webhook:worker
```

Deliver a smaller batch:

```bash
npm run webhook:worker -- --limit 3
```

The worker prints safe summary counts only, including sent, failed, retry-scheduled, terminal-failed, and dry-run counts. The local receiver prints safe received-event metadata only. Neither prints webhook secrets, raw API keys, raw verification tokens, customer contact details, bank/payment details, or payload bodies.

Automated local proof:

```bash
npm run test:webhook-live-proof
```

Retry schedule: transient failures are retried after roughly 1 minute, 5 minutes, 15 minutes, 1 hour, and 6 hours. Rows stop retrying at `maxAttempts` and are marked terminal failed with `terminalFailureAt`.

Before using durable retries, apply the additive migration in `prisma/migrations/20260526000000_add_webhook_retry_fields/` through the normal Prisma migration flow. Do not use `db push` for production.

Webhook endpoint configuration is managed from `/dashboard/integrations` for OWNER/ADMIN dashboard users. Secrets are generated server-side, shown once only, and stored encrypted at rest in the existing `Client.webhookSecret` compatibility field. Older plaintext demo rows remain readable for delivery but should be rotated so they are re-stored encrypted. The API test endpoint uses the configured secret to create a signature preview, but it does not return the secret, encrypted blob, raw headers, or full webhook URL.

---

## 14. Troubleshooting

| Status | Meaning | Fix |
|--------|---------|-----|
| **401** | API key missing or invalid | Add `x-api-key` header. Check that the key was copied after one-time display. Create a new dashboard-managed key if lost. |
| **400** | Payload validation failed | Check the `details` array in the response for the exact field errors. Compare against the test-payloads files. |
| **404** | Token or certificate not found | Token may have been miscopied. Wrong API key (certificate belongs to a different client). |
| **409** | Already completed or declined | Session has already been processed. Use a fresh token from a new sale intake. |
| **410** | Session expired | The 24-hour verification window has passed. Create a new sale to get a fresh token. |
| **500 / connection error** | Database not connected | Set a real `DATABASE_URL` in `.env.local`, run the documented Prisma migration command, and generate the Prisma client. |
| **"DATABASE_URL is placeholder"** | `.env.local` still has the default value | Replace it with a real Supabase/Neon/local Postgres connection string. |

---

## Quick reference — endpoint summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/api/health` | None | Health check |
| `POST` | `/api/v1/sales/intake` | `x-api-key` | Create a sale and verification session |
| `GET`  | `/api/v1/verification-sessions/:token` | None | Look up session (used by customer page) |
| `POST` | `/api/v1/verification-sessions/:token/complete` | None | Customer completes consent |
| `POST` | `/api/v1/verification-sessions/:token/decline` | None | Customer declines consent |
| `GET`  | `/api/v1/certificates/:id` | `x-api-key` | Retrieve a compliance certificate |
| `POST` | `/api/v1/webhooks/test` | `x-api-key` | Preview a signed webhook payload |
| `POST` | `/api/v1/embed-tokens` | `x-api-key` | Issue a short-lived CRM embed token |
| `GET` | `/api/v1/embed/verification/:sessionId/status` | Bearer embed token | Browser-safe verification status |
| `GET` | `/api/v1/embed/deal/:clientReference/status` | Bearer embed token | Browser-safe deal status |

---

## Rate limiting

Public verification endpoints, API-key endpoints, and CRM embed status endpoints return HTTP `429` when the rate limiter blocks a request.

Protected endpoints:

- `GET /api/v1/verification-sessions/:token`
- `POST /api/v1/verification-sessions/:token/complete`
- `POST /api/v1/verification-sessions/:token/decline`
- `POST /api/v1/sales/intake`
- `GET /api/v1/certificates/:id`
- `POST /api/v1/webhooks/test`
- `POST /api/v1/embed-tokens`
- `GET /api/v1/embed/verification/:sessionId/status`
- `GET /api/v1/embed/deal/:clientReference/status`
- `/v/:token` page loads through the same public token lookup policy

Expected 429 shape:

```json
{
  "ok": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests. Please retry later."
  }
}
```

The response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers where practical. Rate-limit keys never store raw verification tokens, raw signed embed tokens, or raw API keys.

Local development can use the in-memory fallback:

```env
RATE_LIMIT_STORE="memory"
```

Production multi-instance deployments should use a shared Upstash Redis REST limiter:

```env
RATE_LIMIT_STORE="upstash"
UPSTASH_REDIS_REST_URL="https://your-upstash-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-rest-token"
RATE_LIMIT_FAIL_OPEN="false"
```

To test locally, keep `RATE_LIMIT_STORE=memory`, start the app, and repeatedly call a protected endpoint until HTTP `429` is returned. For example, call `GET /api/v1/verification-sessions/not-a-real-token` more than the configured lookup/invalid-token threshold. The response must not reveal whether a token exists.

---

## CRM embed tokens

Set `EMBED_TOKEN_SECRET` in `.env.local` before issuing embed tokens. It must be at least 32 characters and must never be exposed in browser code.

Your CRM backend should call:

```bash
curl -X POST http://localhost:3000/api/v1/embed-tokens \
  -H "content-type: application/json" \
  -H "x-api-key: $HVCS_API_KEY" \
  -d '{"type":"deal_status","target":"REF-001"}'
```

Then pass the returned token to the browser iframe or widget, for example:

```html
<script
  src="https://your-hvcs-domain/widget.js"
  data-client-ref="REF-001"
  data-embed-token="short-lived-token-from-your-backend"
></script>
```

Do not put `x-api-key` in browser code. Embed tokens are short-lived and scoped to one target.

Iframe example:

```html
<iframe
  src="https://your-hvcs-domain/embed/deal/REF-001?embedToken=short-lived-token-from-your-backend"
  width="100%"
  height="420"
  style="border:0"
></iframe>
```

The browser widget can also be configured with `data-mode`, `data-target-id`, and `data-embed-token`. Token renewal is the CRM backend's responsibility.

---

## Dashboard

The dashboard shell is available at `http://localhost:3000/dashboard` after Supabase Auth, internal user mapping, and organization membership are configured.

Live tenant-scoped dashboard pages are available for overview, my-sales, sales, verifications, certificates, certificate detail/PDF, API keys, staff, integrations/webhook settings, webhooks, credits, and signups where the signed-in role is allowed. Notifications, client settings, SMS/email delivery, MCP, and verification detail pages remain incomplete or intentionally disabled.
