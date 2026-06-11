# Heimdell Verified Consent API Demo Runbook

This runbook prepares one clean local end-to-end demo. Use fake local demo data only.

Do not use `db push`. Do not reset or wipe production. Do not paste real customer data, real API keys, webhook secrets, raw verification tokens, bank details, or production URLs into demo notes.

## 1. Required local environment

Create or update `.env.local` from `.env.example`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/heimdell_consent?schema=public"
APP_URL="http://localhost:3000"
ENCRYPTION_KEY="base64-encoded-32-byte-key"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
EMBED_TOKEN_SECRET="replace-with-at-least-32-random-characters"
ALLOWED_EMBED_ORIGINS="http://localhost:3000"

DEMO_API_KEY="use-a-fake-local-demo-key-only"
DEMO_ORG_NAME="Heimdell Demo Organization"
DEMO_ORG_SLUG="heimdell-demo"
DEMO_CLIENT_NAME="Heimdell Demo Client"
DEMO_DASHBOARD_EMAIL="demo-admin@example.com"
DEMO_DASHBOARD_EXTERNAL_AUTH_ID="supabase-auth-user-id"
DEMO_WEBHOOK_URL="http://localhost:4010/webhook"
DEMO_SKIP_DASHBOARD_USER="false"
```

Generate `ENCRYPTION_KEY` if needed:

```bash
npm run generate:encryption-key
```

`DEMO_DASHBOARD_EXTERNAL_AUTH_ID` must be the Supabase Auth user UUID you will use to log into `/login`.
Only set `DEMO_SKIP_DASHBOARD_USER=true` for API-only checks; the full demo requires a mapped dashboard user.

## Production domain and PWA readiness

Production deployment is expected at:

```text
https://telecomcompliance.uk
```

Set `APP_URL=https://telecomcompliance.uk` in production and configure Supabase Auth redirect URLs to include `https://telecomcompliance.uk/auth/callback`. Add trusted CRM origins to `ALLOWED_EMBED_ORIGINS`; do not put API keys, webhook secrets, or embed tokens in origin settings.

The app includes a PWA manifest for Heimdell Verified Consent with start URL `/`, scope `/`, standalone display, and 192/512 icon assets. Before launch, verify installability in the browser application panel and confirm the manifest resolves from the production root domain.

The shared app footer displays:

```text
© 2026 Heimdell Tech Ai Ltd. Registered in England & Wales. Company No. 16478408. ICO Reg: ZC079121.
```

Do not add the registered office address to this app/dashboard footer.

## 2. Migrations

Local development database:

```bash
npm run db:validate
npm run db:migrate:dev
npm run db:generate
```

Production database:

```bash
npm run db:validate
npm run db:migrate:deploy
npm run db:generate
```

Production safety:

- Do not use `db push`.
- Do not reset production.
- Back up first.
- Review `prisma/migrations/` before deploying.

## 3. Setup demo organization, user, client, and API key

Run:

```bash
npm run setup:demo
```

This is idempotent. It creates or updates:

- demo organization
- demo client
- dashboard user mapping if `DEMO_DASHBOARD_EXTERNAL_AUTH_ID` is set
- OWNER membership for the demo dashboard user
- legacy client API key hash and dashboard `ApiKey` row from `DEMO_API_KEY`
- optional local webhook endpoint from `DEMO_WEBHOOK_URL`

The script does not print raw API keys or webhook secrets.

If you set `DEMO_SKIP_DASHBOARD_USER=true`, only the API-side setup is created. The dashboard checks, protected certificate detail page, PDF export, and webhooks dashboard require a mapped Supabase dashboard user.

## 4. Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000/login
```

Sign in as the Supabase demo user, then open:

```text
http://localhost:3000/dashboard
```

## 5. Optional local webhook receiver

In a second terminal, run the safe local receiver:

```bash
npm run webhook:receiver
```

This listens on `http://localhost:4010/webhook` by default and prints a safe delivery summary only. Set `WEBHOOK_TEST_SECRET` if you want the receiver to verify signatures locally. Do not paste payload bodies, API keys, webhook secrets, payment details, or customer contact details into chat or tickets.

## 6. Submit demo sale intake

Endpoint: `POST /api/v1/sales/intake`

PowerShell:

```powershell
$env:HVCS_API_KEY=$env:DEMO_API_KEY
$clientReference = "DEMO-" + (Get-Date -Format "yyyyMMddHHmmss")
$payload = Get-Content -Raw "test-payloads/sale-intake.valid.json" | ConvertFrom-Json
$payload.client_reference = $clientReference
$payload.customer.full_name = "Heimdell Demo Customer"
$payload.customer.email = "demo-customer@example.com"
$payload.customer.phone = "447700900123"
$payload.customer.address = "1 Demo Street, London, SW1A 1AA"
$payload.direct_debit.account_holder_name = "Heimdell Demo Customer"
$body = $payload | ConvertTo-Json -Depth 10

$sale = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/sales/intake" `
  -Headers @{ "x-api-key" = $env:HVCS_API_KEY; "content-type" = "application/json" } `
  -Body $body

$sale | ConvertTo-Json -Depth 5
$verificationUrl = $sale.verification_url
$token = ($verificationUrl -split "/v/")[1]
$saleId = $sale.sale_id
$sessionId = $sale.verification_session_id
```

Browser check:

```text
http://localhost:3000/v/<token>
```

## 7. Complete verification

PowerShell:

```powershell
$completion = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/verification-sessions/$token/complete" `
  -Headers @{ "content-type" = "application/json" } `
  -Body (Get-Content -Raw "test-payloads/complete-verification.valid.json")

$completion | ConvertTo-Json -Depth 5
$certificateId = $completion.certificate_id
```

Expected:

- `ok: true`
- `status: COMPLETED`
- `certificate_id` present

## 8. Dashboard checks

Open these pages as the logged-in demo dashboard user:

```text
http://localhost:3000/dashboard/overview
http://localhost:3000/dashboard/sales
http://localhost:3000/dashboard/verifications
http://localhost:3000/dashboard/certificates
http://localhost:3000/dashboard/certificates/<certificateId>
```

Expected:

- overview counts update
- sales page shows the demo sale
- verifications page shows the demo session
- certificates page shows the demo certificate
- certificate detail opens and shows safe evidence only

## 9. Protected PDF export

Protected route pattern: `/dashboard/certificates/[id]/pdf`

Open:

```text
http://localhost:3000/dashboard/certificates/<certificateId>/pdf
```

Expected:

- a PDF downloads
- filename uses certificate ID only
- no raw tokens, full bank details, full customer contact details, raw certificate JSON, or webhook secrets

## 10. Webhook worker check

Webhook delivery is worker-based. Completing a verification queues `WEBHOOK` notification rows; it does not POST immediately. Run the finite worker to send queued webhooks.

Dry run:

```bash
npm run webhook:worker -- --dry-run
```

Live local run, only if the local receiver is running and `DEMO_WEBHOOK_URL` points to localhost:

```bash
npm run webhook:worker -- --limit 10
```

Dashboard check:

```text
http://localhost:3000/dashboard/webhooks
```

Expected:

- webhook records appear
- status/attempt metadata updates
- receiver prints safe event, delivery ID, status, reference, certificate, and signature presence/status
- only destination hostname is displayed
- no webhook secret, full URL, raw payload, or raw headers are displayed

## 11. Generate embed token

Endpoint: `POST /api/v1/embed-tokens`

Verification status token:

```powershell
$embed = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/embed-tokens" `
  -Headers @{ "x-api-key" = $env:HVCS_API_KEY; "content-type" = "application/json" } `
  -Body (@{
    type = "verification_status"
    target = $sessionId
  } | ConvertTo-Json)

$embed | ConvertTo-Json -Depth 5
$embedToken = $embed.token
```

Deal status token:

```powershell
$dealEmbed = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/embed-tokens" `
  -Headers @{ "x-api-key" = $env:HVCS_API_KEY; "content-type" = "application/json" } `
  -Body (@{
    type = "deal_status"
    target = $clientReference
  } | ConvertTo-Json)
```

x-api-key stays server-side only. The browser receives only `embedToken`.

## 12. CRM iframe/widget checks

Iframe:

```text
http://localhost:3000/embed/verification/<sessionId>?embedToken=<embedToken>
```

Widget snippet for a local HTML test page:

```html
<div id="heimdell-consent-status"></div>
<script>
  window.HeimdellWidgetConfig = {
    heimdellBaseUrl: "http://localhost:3000",
    mode: "verification",
    targetId: "<sessionId>",
    embedToken: "<embedToken>",
    container: "#heimdell-consent-status"
  };
</script>
<script src="http://localhost:3000/widget.js"></script>
```

Expected:

- safe status renders
- no API key in browser code
- no customer bank/payment/contact details

## 13. Final demo reset guidance

Do not reset or wipe the database as part of the demo. For another pass, either:

- submit another sale with a new `client_reference`, or
- use a fresh local development database and apply migrations normally.

## 14. Seller-owned sale completion proof

Use this when proving that a seller-owned sale moves from pending to completed.
Do not paste the raw API key into docs or screenshots.

Prerequisites:

- Test Telecom Ltd has a linked Client row.
- Platform admin has created a client-linked API key for Test Telecom Ltd.
- `seller1@testtelecom.local` exists as a `SELLER` in Test Telecom Ltd.
- The seller has completed forced password change.

Set the API key only in your local shell:

```powershell
$env:HVCS_API_KEY="paste-the-test-telecom-api-key-here"
$clientReference = "SELLER-PROOF-" + (Get-Date -Format "yyyyMMddHHmmss")
```

Submit intake with seller ownership:

```powershell
$payload = Get-Content -Raw "test-payloads/sale-intake.valid.json" | ConvertFrom-Json
$payload.client_reference = $clientReference
$payload.seller_email = "seller1@testtelecom.local"
$payload.customer.full_name = "Seller Proof Customer"
$payload.customer.email = "seller-proof-customer@example.com"
$payload.customer.phone = "447700900555"
$payload.customer.address = "1 Seller Proof Street, London, SW1A 1AA"
$payload.direct_debit.account_holder_name = "Seller Proof Customer"
$body = $payload | ConvertTo-Json -Depth 10

$sale = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/sales/intake" `
  -Headers @{ "x-api-key" = $env:HVCS_API_KEY; "content-type" = "application/json" } `
  -Body $body

$verificationUrl = $sale.verification_url
$token = ($verificationUrl -split "/v/")[1]
$saleId = $sale.sale_id
$sessionId = $sale.verification_session_id
```

Expected before completion:

- intake returns `ok: true`, `sale_id`, `verification_session_id`, `verification_url`, and `status: PENDING`
- seller login at `/login` shows the new sale on `/dashboard/my-sales`
- seller sees pending sale/verification status only for their own submitted sale
- seller cannot access `/dashboard/sales`, `/dashboard/verifications`, `/dashboard/certificates`, `/dashboard/staff`, `/dashboard/api-keys`, `/dashboard/webhooks`, `/dashboard/integrations`, `/dashboard/clients`, or `/dashboard/settings`

Complete the customer verification:

```powershell
$completion = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/verification-sessions/$token/complete" `
  -Headers @{ "content-type" = "application/json" } `
  -Body (@{
    confirm_details_correct = $true
    confirm_product_price_frequency = $true
    confirm_terms = $true
    confirm_policies = $true
    confirm_cooling_off = $true
    authorise_direct_debit = $true
    confirm_evidence_storage = $true
    typed_name = "Seller Proof Customer"
  } | ConvertTo-Json)

$certificateId = $completion.certificate_id
```

Expected after completion:

- completion returns `ok: true`, `status: COMPLETED`, and `certificate_id`
- seller sees the same sale on `/dashboard/my-sales` with sale status `Verified` and verification status `Completed`
- client owner can see the sale in `/dashboard/sales` and the verification in `/dashboard/verifications`
- certificate exists for certificate-authorized roles, while seller remains blocked from certificate list/detail/PDF
