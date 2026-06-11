# CRM Integration Guide — Heimdell Verified Consent API

This document explains how to integrate Heimdell Verified Consent API (HVCS) into an external CRM
so that live compliance verification becomes part of the seller's normal deal workflow.

For a local end-to-end demo of intake, verification, dashboard checks, webhooks, and embed tokens, see `DEMO_RUNBOOK.md`.

---

## 1. Overview

Heimdell is an API-first consent and compliance verification layer designed for:

- Field sales
- Telecom sales
- Energy sales
- Solar and home improvement sales
- Merchant services
- Any other regulated sales environment where independent customer confirmation is required

The CRM integration allows sellers to trigger a Heimdell verification session directly from a deal
record, show the customer a secure verification page on their own device, and automatically receive
the outcome back into the CRM via webhook — without the seller handling or reading compliance
terms themselves.

---

## 2. The Core Principle

> **"The seller triggers compliance. The customer completes compliance. Heimdell stores proof. The CRM receives the result."**

This separation is intentional:

- The **seller** never reads compliance terms to the customer.
- The **customer** reviews everything on their own device, in their own time, in their own words.
- **Heimdell** records what was shown, when it was opened, whether it was accepted, and generates a
  tamper-evident certificate if the customer confirms.
- The **CRM** receives the outcome automatically and stores it against the deal record.

---

## 3. Seller Workflow

The complete flow from the seller's perspective:

1. Seller enters customer details, product details, and Direct Debit information into the CRM deal record.
2. Seller clicks **Start Heimdell Verification** inside the CRM (button in the Heimdell widget or CRM sidebar).
3. CRM backend calls `POST /api/v1/sales/intake` with the sale details (server-side only — never from browser code).
4. Heimdell creates a verification session and returns `verification_url`, `verification_session_id`, `status`, and `expires_at`.
5. CRM displays the embedded Heimdell widget showing the session status.
6. Seller asks the customer to open the secure Heimdell verification link on their own phone.
7. Customer opens the link, reviews the product, price, terms, cooling-off rights, and masked Direct Debit details.
8. Customer taps **Confirm** (consent) or **Decline** (with an optional reason).
9. Heimdell records the full evidence set and generates a compliance certificate if completed.
10. Heimdell queues a signed webhook writeback to the CRM endpoint.
11. CRM receives the webhook and updates the deal record fields automatically.

---

## 4. Seller Script

The following script should be used by sellers when presenting the Heimdell verification step to
the customer.

### When initiating verification

> "I've entered your details into our system. You'll now receive a secure Heimdell verification
> link. Please open it on your phone, check the product, price, terms, cooling-off rights, and
> Direct Debit details, then confirm if everything is correct."

### If the customer asks why

> "It protects you and us. It makes sure everything is clear and recorded before the order goes
> ahead."

### If the customer says the details are wrong

> "No problem — press 'details are incorrect' and I'll correct the sale record before we restart
> the verification."

The seller should not attempt to read compliance terms aloud, pressure the customer to confirm, or
bypass the verification step.

---

## 5. API Flow

### Initiating a verification session

The CRM backend calls this endpoint server-side with a valid `x-api-key` header:

```
POST /api/v1/sales/intake
Content-Type: application/json
x-api-key: <your_api_key>
```

**Request body:**

```json
{
  "clientReference": "CRM-DEAL-001",
  "customerName": "Jane Smith",
  "customerEmail": "jane@example.com",
  "customerPhone": "+447700900000",
  "productName": "Premium Broadband",
  "subscriptionPrice": "49.99",
  "subscriptionFrequency": "month",
  "bankAccountNameMasked": "J Smith",
  "bankSortCode": "12-34-56",
  "bankAccountNumberMasked": "****5678"
}
```

**Response:**

```json
{
  "sale_id": "sale_xxxxxxxxxxxxxxxxxxxx",
  "verification_session_id": "sess_xxxxxxxxxxxxxxxxxxxx",
  "verification_url": "https://telecomcompliance.uk/v/eyJ...",
  "status": "PENDING",
  "expires_at": "2026-05-20T15:30:00.000Z"
}
```

The `verification_url` is the link sent to or shown to the customer. It contains a secure,
single-use token that is SHA-256-hashed in the database.

---

## 6. CRM Embed Flow

### Option A: iframe embed (current MVP)

Embed the Heimdell session widget inside a CRM deal panel or sidebar using a standard HTML iframe:

```html
<iframe
  src="https://telecomcompliance.uk/embed/verification/{sessionId}?embedToken={shortLivedEmbedToken}"
  width="100%"
  height="520"
  style="border: none;"
  title="Heimdell Verification Status"
></iframe>
```

Replace `{sessionId}` with the `verification_session_id` returned by the intake API. The CRM backend must request `{shortLivedEmbedToken}` from `POST /api/v1/embed-tokens`; never put `x-api-key` in iframe or browser code.

Production deployments must also configure the CRM site origin in `ALLOWED_EMBED_ORIGINS`, for example `https://crm.example.com` or `https://app.hubspot.com`. Heimdell uses that list for `/embed/*` `frame-ancestors` CSP and browser Origin/Referer checks on embed status APIs.

The Heimdell Verified Consent production app domain is `https://telecomcompliance.uk`. Use that root domain for widget and iframe URLs unless a future Heimdell product is deliberately deployed with its own manifest, app identity, and domain.

### Production widget flow

The CRM backend is responsible for issuing short-lived embed tokens. The browser receives only the embed token, never the server API key.

Backend pseudocode:

```ts
const tokenResponse = await fetch("https://telecomcompliance.uk/api/v1/embed-tokens", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.HEIMDELL_API_KEY,
  },
  body: JSON.stringify({
    type: "deal_status",
    target: crmDealReference,
  }),
});

const { token, expiresAt } = await tokenResponse.json();
```

Frontend widget example:

```html
<script
  src="https://telecomcompliance.uk/widget.js"
  data-mode="deal"
  data-target-id="CRM-DEAL-123"
  data-embed-token="short-lived-token-from-your-backend"
  data-position="bottom-right"
></script>
```

Inline container example:

```html
<div id="heimdell-consent-status"></div>
<script>
  window.HeimdellWidgetConfig = {
    heimdellBaseUrl: "https://telecomcompliance.uk",
    mode: "verification",
    targetId: "verification-session-id",
    embedToken: "short-lived-token-from-your-backend",
    container: "#heimdell-consent-status"
  };
</script>
<script src="https://telecomcompliance.uk/widget.js"></script>
```

The widget does not fetch or renew tokens itself. If the CRM page stays open beyond token expiry, the CRM backend must issue a new embed token and reload or refresh the widget with that new token.

The widget displays:
- Verification status
- Sale status
- Client reference
- Product name
- Safe timestamps
- Certificate ID when available

It must not display customer contact details, bank/payment data, raw verification tokens, hashes, raw API keys, or full certificate JSON.

### Option B: JavaScript widget

The current `public/widget.js` is a lightweight JavaScript snippet that mounts a safe status panel into a CRM page. It accepts an injected short-lived `embedToken` and fetches only the protected embed status endpoints. Automatic token renewal is intentionally not included because that would require server credentials in browser code.

### Option C: Native CRM marketplace app (future)

A native Heimdell app built for Salesforce, HubSpot, Pipedrive, or similar CRM marketplaces.
Provides deep integration with CRM objects, field mapping wizards, and one-click setup.

---

## 7. Required CRM Fields

Map these fields to the deal or contact record in the CRM. Values are written back by Heimdell
automatically after each verification event via webhook.

| CRM Field | Value Written |
|---|---|
| `hvcs_sale_id` | Internal Heimdell sale record ID |
| `hvcs_verification_session_id` | Unique verification session token |
| `hvcs_verification_status` | `PENDING`, `OPENED`, `COMPLETED`, `DECLINED`, or `EXPIRED` |
| `hvcs_verification_url` | Customer-facing verification link |
| `hvcs_certificate_id` | Certificate record ID (set when verification completes) |
| `hvcs_certificate_url` | API endpoint to retrieve the full certificate JSON |
| `hvcs_completed_at` | ISO timestamp of customer consent confirmation |
| `hvcs_declined_reason` | Customer-provided reason for declining (if given) |
| `hvcs_last_webhook_event` | Most recent webhook event received by the CRM |

---

## 8. Security Rules

These rules are mandatory for all CRM integrations. Violating them risks exposing customer data
and invalidating the compliance record.

- **API calls must be server-side only.** The CRM backend calls `POST /api/v1/sales/intake`. The
  browser never calls Heimdell directly.
- **Never expose the `x-api-key` in frontend JavaScript.** API keys embedded in browser code can
  be extracted by anyone. Keep them in server-side environment variables only.
- **API keys are hashed at rest.** Heimdell stores only a bcrypt hash of each API key. The raw key
  is shown once only (at creation time) and cannot be recovered.
- **Webhook signing secrets are encrypted at rest.** Secrets generated or rotated from
  `/dashboard/integrations` are shown once only and stored as AES-256-GCM encrypted values.
  Older plaintext demo rows remain readable for delivery compatibility, but should be rotated
  before production use.
- **Webhooks are signed with HMAC-SHA256.** Always verify the `x-hvcs-signature` header before
  processing a webhook payload. Reject requests that fail signature verification.
- **Embed tokens are required for live embed status.** The CRM backend issues short-lived signed
  tokens with `POST /api/v1/embed-tokens` and injects them into iframe/widget URLs.
- **Allowed browser origins must be configured.** Add trusted CRM origins to
  `ALLOWED_EMBED_ORIGINS`. Heimdell uses CSP `frame-ancestors` for iframe control and validates
  browser `Origin`/`Referer` headers when present. These headers are operational safeguards, not
  a replacement for signed embed tokens.
- **Full Direct Debit account numbers must never be exposed in widgets or APIs.** Only masked
  account details (e.g. `****5678`) should be shown to sellers or customers via any embed or
  API response.
- **Never store raw bank details in the CRM widget.** The Heimdell verification record stores only
  the masked values. Full account numbers must never enter the frontend layer.

---

## 9. Webhook Writeback

Heimdell queues a signed HTTP POST to the CRM webhook endpoint after each key verification event. Delivery is worker-based, not immediate. The finite worker command `npm run webhook:worker` can be run manually or scheduled by cron/platform jobs. The worker only processes due deliveries and uses durable retry fields on the notification record.

### Events

| Event | When it fires |
|---|---|
| `verification.link_created` | A new verification session is created via sales intake |
| `verification.completed` | Customer confirms consent on the verification page |
| `verification.declined` | Customer declines on the verification page |
| `certificate.created` | Compliance certificate has been generated and is available |

### Webhook payload example

```json
{
  "event": "verification.completed",
  "event_id": "uuid",
  "created_at": "2026-05-20T14:08:41.000Z",
  "client_id": "client_xxxxxxxxxxxxxxxxxxxx",
  "sale_id": "sale_xxxxxxxxxxxxxxxxxxxx",
  "client_reference": "CRM-DEAL-123",
  "verification_session_id": "sess_xxxxxxxxxxxxxxxxxxxx",
  "certificate_id": "cert_xxxxxxxxxxxxxxxxxxxx",
  "status": "COMPLETED",
  "data": {
    "delivery_id": "notification_xxxxxxxxxxxxxxxxxxxx",
    "product_name": "Example Product",
    "sale_status": "CONSENT_CONFIRMED",
    "verification_status": "COMPLETED",
    "verification_completed_at": "2026-05-20T14:08:41.000Z"
  }
}
```

Webhook payloads do not include customer phone, customer email, customer address, bank/payment details, raw verification URLs, raw verification tokens, hashes, webhook secrets, or full certificate JSON.

### Signature verification

Every webhook request includes signed headers:

```
X-Heimdell-Signature: sha256=<hex_signature>
X-HVCS-Signature: sha256=<hex_signature>
X-Heimdell-Event-Type: verification.completed
X-Heimdell-Delivery-Id: notification_xxxxxxxxxxxxxxxxxxxx
```

The signature is computed as:

```
HMAC-SHA256(raw_request_body, WEBHOOK_SECRET)
```

Verify it server-side before processing. Reject any request where the signature does not match.
Never process unauthenticated webhook payloads.

Retry behavior: successful `2xx` responses mark delivery `SENT`. Transient failures are retried with staged backoff of 1 minute, 5 minutes, 15 minutes, 1 hour, and 6 hours until `maxAttempts`. Exhausted attempts, missing secrets, invalid payload state, and non-HTTPS production webhook URLs are terminal failures.

Production recommendation: schedule `npm run webhook:worker` from a platform scheduler, cron job, or queue worker often enough to pick up due `nextAttemptAt` records. Keep webhook secrets server-side only.

The dashboard `/dashboard/webhooks` page shows safe tenant-scoped delivery metadata for OWNER/ADMIN users: event type, status, sale/client reference, retry counts, safe response status/error, timestamps, and destination hostname. It does not expose webhook secrets, full URLs, raw payloads, raw headers, customer data, payment data, tokens, hashes, or certificate JSON. Retry and endpoint-edit actions are not active yet.

Webhook endpoint configuration is available in `/dashboard/integrations` for OWNER/ADMIN users. Heimdell stores the destination URL and encrypted signing secret on the existing `Client` record for compatibility with the v1 webhook queue and test endpoint. The signing secret is generated server-side and displayed once after creation or regeneration; store it in the CRM backend secret manager immediately. The dashboard later shows only configured status, destination hostname, and a short fingerprint. Disabling an endpoint stops future queueing by clearing the destination URL but keeps delivery history intact.

### Local delivery proof

For a safe local proof, start the receiver:

```bash
npm run webhook:receiver
```

Configure the demo client webhook URL to `http://localhost:4010/webhook`, complete a verification, then process the queue:

```bash
npm run webhook:worker -- --dry-run
npm run webhook:worker -- --limit 10
```

The receiver prints a safe summary with event type, delivery ID, sale/reference IDs, verification/certificate IDs, statuses, and signature presence/status. It does not print webhook secrets, raw payload dumps, API keys, tokens, bank/payment fields, or customer contact details. The automated local proof is:

```bash
npm run test:webhook-live-proof
```

---

## 10. CRM Implementation Options

| Option | Description | Status |
|---|---|---|
| **Backend API integration** | CRM server calls `POST /api/v1/sales/intake` and receives session data | Available now |
| **iframe embed (MVP)** | Embed session status widget via standard HTML `<iframe>` | Available now |
| **JavaScript widget** | Lightweight JS snippet for CRM sidebar extensions | Available now |
| **Native CRM marketplace app** | First-party apps for Salesforce, HubSpot, Pipedrive, etc. | Future phase |
| **Custom CRM integration** | Bespoke integration built for a specific CRM platform | Available on request |

---

## 11. What the Widget Should Show

### Status display

The widget must clearly display the current verification status at all times:

| Status | Meaning |
|---|---|
| **Pending** | Verification link created; customer has not yet opened it |
| **Opened** | Customer has opened the link and is reviewing |
| **Completed** | Customer confirmed consent; certificate available |
| **Declined** | Customer declined; decline reason logged |
| **Expired** | Link expired before the customer responded |

### Available actions

| Action | When available |
|---|---|
| Copy verification link | Pending, Opened |
| Open customer page | Pending, Opened (requires live URL) |
| Refresh status | All statuses (requires live database) |
| View certificate | Completed |
| Restart verification | Declined (requires a new intake call) |

---

## 12. What Not to Do

- **Do not ask the seller to manually read compliance terms to the customer.** The entire point of
  Heimdell is that the customer reads and confirms independently.
- **Do not put API keys in browser code.** This exposes the key to anyone who views page source or
  network requests.
- **Do not store raw bank account numbers in the CRM widget or deal record.** Only masked values
  should be recorded outside the secure verification evidence store.
- **Do not bypass customer confirmation.** Pre-ticking the "confirm" box, auto-submitting, or any
  other bypass invalidates the compliance record and likely violates regulatory requirements.
- **Do not treat the widget as the proof.** The widget shows status only. The compliance proof is
  the Heimdell certificate and the underlying evidence record — retrievable via
  `GET /api/v1/certificates/{id}`. The CRM should store the certificate ID and link to it.

---

## 13. Commercial Positioning

The CRM integration layer is the primary commercial feature of Heimdell.

A standalone consent API has limited addressable market. The value is in **embedding Heimdell
directly into the seller's existing workflow** — inside the CRM they already use, at the moment
in the deal lifecycle when compliance is needed.

This means:

- Sales operations teams do not need to switch tools.
- Compliance verification becomes a natural step in the deal, not a separate process.
- The CRM deal record becomes the single source of truth for both commercial and compliance data.
- Regulatory audits can be answered by pointing to `hvcs_certificate_id` in the CRM and calling
  `GET /api/v1/certificates/{id}`.

The competitive moat is the combination of:
1. API-first design (any CRM, any backend)
2. iframe/widget embed (zero CRM rebuild required)
3. Signed webhook writeback (automatic deal update)
4. Tamper-evident certificate (regulatorily defensible proof)

Companies in field sales, telecom, energy, and merchant services pay for compliance infrastructure
because regulatory risk is directly tied to revenue. Heimdell removes that risk from the deal
process while keeping the seller in their existing workflow.

---

## 14. Embed Status Refresh Endpoints

The CRM embed widget can poll these endpoints to refresh verification status without a full
page reload. Both endpoints require a short-lived signed embed token issued by the CRM backend.
The browser must never send an `x-api-key`.

### Verification session status

```
GET /api/v1/embed/verification/{sessionId}/status
```

Returns the current status, timestamps, and certificate ID for a single verification session.

**Protected response shape:**

```json
{
  "ok": true,
  "session_id": "{sessionId}",
  "sale_id": "sale_id",
  "client_reference": "CRM-123",
  "verification_status": "PENDING",
  "sale_status": "PENDING_VERIFICATION",
  "product_name": "Premium Broadband",
  "created_at": "...",
  "expires_at": "...",
  "opened_at": null,
  "completed_at": null,
  "declined_at": null,
  "certificate_id": null
}
```

### Deal-level status

```
GET /api/v1/embed/deal/{clientReference}/status
```

Returns the latest verification status for all sessions associated with a CRM deal reference.

**Protected response shape:**

```json
{
  "ok": true,
  "sale_id": "sale_id",
  "client_reference": "{clientReference}",
  "product_name": "Premium Broadband",
  "sale_status": "PENDING_VERIFICATION",
  "sale_created_at": "...",
  "sale_updated_at": "...",
  "latest_verification_session_id": "verification_session_id",
  "latest_verification_status": "PENDING",
  "latest_verification_created_at": "...",
  "latest_verification_expires_at": "...",
  "latest_verification_completed_at": null,
  "latest_verification_declined_at": null,
  "certificate_id": null
}
```

### Security requirement

These endpoints are called from the browser (inside the CRM embed widget). They must **never**
use `x-api-key` authentication — that header is for server-to-server calls only and must never
appear in frontend code.

Both endpoints require a **short-lived signed embed token** issued by the CRM backend and
validated by Heimdell. Tokens are scoped to a single session or deal reference. Unsigned,
expired, wrong-scope, or wrong-target requests are rejected.

---

## See Also

- [API_TESTING.md](API_TESTING.md) — curl examples for every endpoint
- [DATABASE_SETUP.md](DATABASE_SETUP.md) — connecting a PostgreSQL database
- [README.md](README.md) — project overview and tech stack
