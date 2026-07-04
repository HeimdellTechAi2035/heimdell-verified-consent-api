# Heimdell Dashboard Access Setup

This guide explains Heimdell dashboard access, platform-admin client provisioning, and the older local setup fallback.

The dashboard overview, my-sales, sales, verifications, certificates list/detail/PDF, API keys, staff, integrations/webhook settings, webhooks, credits, and signups pages now use protected tenant-scoped flows where implemented. Notifications, client settings, SMS/email delivery, MCP, and verification detail pages remain unfinished or intentionally disabled.

For a full local demo sequence, use `DEMO_RUNBOOK.md`.

---

## Prerequisites

1. PostgreSQL migrations have been applied to your local development database.
2. Supabase Auth is configured with:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

3. For platform-admin provisioning, set the server-only service-role key:

```env
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
```

Never prefix this with `NEXT_PUBLIC_`, never expose it in browser code, and never paste it into client-side configuration.

4. For the older local setup script, a dashboard user has been created or invited in Supabase Auth and you have copied that user's UUID from the Supabase dashboard.

Never use or expose the Supabase service-role key in browser code.

---

## Recommended platform provisioning flow

Use this flow for normal client/company onboarding once the required migrations are applied.

1. Sign in as a Heimdell platform admin: `PLATFORM_ADMIN` or temporary legacy `OWNER`.
2. Open `/dashboard/clients/new`.
3. Enter the company details, first client admin email, and a temporary password.
4. Submit the form.
5. Heimdell creates:
   - `Organization`
   - Supabase Auth user
   - internal `User`
   - `OrganizationMembership`
6. The first client admin is assigned `CLIENT_OWNER` when the enum migration is available. If that enum value is not present in the database yet, the app falls back to legacy `ADMIN`.
7. The user is marked `mustChangePassword=true`.
8. On first dashboard login, the user is redirected to `/dashboard/change-password`.
9. After changing their password, `mustChangePassword` is cleared and normal tenant-scoped dashboard access is allowed.

Client users cannot access `/dashboard/clients/new`, API keys, webhooks, integrations, or other companies.

Required migration:

```bash
npm run db:migrate:dev
```

Production must use:

```bash
npm run db:migrate:deploy
```

Do not use `db push` for this workflow.

---

## Local fallback setup flow

The setup script remains useful for local demos and emergency repair only. It is not the normal onboarding workflow.

### 1. Create or invite a Supabase user

In Supabase:

1. Open Authentication.
2. Create or invite the dashboard user.
3. Copy the user's Supabase Auth ID.

Keep public self-serve signup disabled until explicitly approved.

### 2. Run the safe setup script

You can use environment variables:

```powershell
$env:DASHBOARD_ORG_NAME="Acme Broadband Ltd"
$env:DASHBOARD_ORG_SLUG="acme-broadband"
$env:DASHBOARD_USER_EMAIL="admin@example.com"
$env:DASHBOARD_USER_EXTERNAL_AUTH_ID="supabase-user-uuid"
$env:DASHBOARD_USER_ROLE="OWNER"
npm run setup:dashboard-user
```

Or CLI args:

```bash
npm run setup:dashboard-user -- \
  --org-name "Acme Broadband Ltd" \
  --org-slug "acme-broadband" \
  --email "admin@example.com" \
  --external-auth-id "supabase-user-uuid" \
  --role OWNER
```

The script is idempotent where practical:

- creates or updates `Organization`
- creates or updates internal `User`
- creates or updates `OrganizationMembership`
- updates the role assignment

It never prints secrets, raw API keys, full tokens, or payment data.

### 3. Optionally link a development client

To link an existing API `Client` to the organization:

```bash
npm run setup:dashboard-user -- \
  --org-name "Acme Broadband Ltd" \
  --org-slug "acme-broadband" \
  --email "admin@example.com" \
  --external-auth-id "supabase-user-uuid" \
  --role OWNER \
  --client-id "client_id_here"
```

You can also use `--client-name "Acme Broadband Ltd"` or, for local development only, `--link-dev-client` to link the first available client.

Do not paste raw API keys into this command.

### 4. Verify dashboard access

1. Start the app with `npm run dev`.
2. Visit `/login`.
3. Sign in with the Supabase user.
4. Visit `/dashboard`.

Expected states:

- unauthenticated users redirect to `/login`
- authenticated users without internal mapping are blocked
- mapped users without membership are blocked
- mapped users with membership see live `/dashboard/overview` metrics, live `/dashboard/sales` rows, live `/dashboard/verifications` rows, live `/dashboard/certificates` metadata, protected `/dashboard/certificates/[id]` evidence summaries and PDF downloads for certificate-authorized roles, live `/dashboard/api-keys` metadata for OWNER/ADMIN users, live `/dashboard/webhooks` delivery metadata for OWNER/ADMIN users, and webhook endpoint settings on `/dashboard/integrations`
- users without the required role see an access denied panel

---

## Role gates

| Section | Allowed roles |
|---|---|
| overview | `PLATFORM_ADMIN`, `CLIENT_OWNER`, `CLIENT_MANAGER`, legacy `OWNER`, legacy `ADMIN`, legacy `MANAGER`, `COMPLIANCE_VIEWER` |
| my-sales | `PLATFORM_ADMIN`, `CLIENT_OWNER`, `CLIENT_MANAGER`, legacy `OWNER`, legacy `ADMIN`, legacy `MANAGER`, `SELLER` |
| sales | `PLATFORM_ADMIN`, `CLIENT_OWNER`, `CLIENT_MANAGER`, legacy `OWNER`, legacy `ADMIN`, legacy `MANAGER` |
| verifications | `PLATFORM_ADMIN`, `CLIENT_OWNER`, `CLIENT_MANAGER`, legacy `OWNER`, legacy `ADMIN`, legacy `MANAGER` |
| certificates | `PLATFORM_ADMIN`, `CLIENT_OWNER`, `CLIENT_MANAGER`, `COMPLIANCE_VIEWER`, legacy `OWNER`, legacy `ADMIN`, legacy `MANAGER` |
| clients | `PLATFORM_ADMIN`, legacy `OWNER` only |
| api-keys | `PLATFORM_ADMIN`, legacy `OWNER` only |
| webhooks | `PLATFORM_ADMIN`, legacy `OWNER` only |
| settings | `PLATFORM_ADMIN`, `CLIENT_OWNER`, legacy `OWNER`, legacy `ADMIN` |
| integrations | `PLATFORM_ADMIN`, legacy `OWNER` only |
| notifications | `PLATFORM_ADMIN`, `CLIENT_OWNER`, legacy `OWNER`, legacy `ADMIN` |

`/dashboard/clients/new` follows the `clients` policy and is platform-admin-only.

`/dashboard/my-sales` is the seller-safe landing page. It intentionally shows
only sales where `Sale.submittedByUserId` matches the logged-in seller and the
sale belongs to the current organization.

Sale intake can attach ownership with optional `seller_email`. When provided,
the email must match an internal Heimdell user with membership in the same
organization as the authenticated API client/key. Allowed owner roles are
`SELLER`, `CLIENT_MANAGER`, `CLIENT_OWNER`, legacy `ADMIN`, and legacy
`MANAGER`. Payloads without `seller_email` continue to work and create sales
without dashboard seller ownership.

`Sale.agentId` remains available as a legacy/external CRM or agent reference and
is not treated as trusted dashboard user ownership.

Role policy lives in `src/lib/dashboard-role-policy.ts`.

---

## Verification

Run:

```bash
npm run test:dashboard-access
```

This verifies:

- each page role gate allows the intended roles
- denied roles are blocked
- unknown sections fail closed
- setup input validation fails when required values are missing
- invalid roles and ambiguous client linking are rejected

---

## Still incomplete before production rollout

Before more real dashboard data can be connected:

- tenant-scoped database queries must be added per remaining page
- every query must scope through organization membership and `Client.organizationId`
- admin actions need audit logging around mutations
- v1 API route authentication now supports active, unexpired `ApiKey` rows plus legacy `Client.apiKeyHash` fallback
- no page may expose `apiKeyHash`, `tokenHash`, `encryptedAccountNumber`, raw keys, raw tokens, or full bank details
- certificate PDF download is protected and tenant-scoped; email/share/export-all actions remain blocked until a dedicated export delivery phase
- webhook endpoint signing secrets are generated server-side, shown once only, and stored encrypted at rest when saved or rotated from `/dashboard/integrations`; older plaintext demo rows should be rotated before production use
- webhook retry and delivery detail actions remain disabled placeholders until a dedicated webhook management phase
- webhook endpoint configuration is available on `/dashboard/integrations`; `PLATFORM_ADMIN` and legacy `OWNER` can save, disable, and regenerate one-time signing secrets. Normal client users cannot access this area yet.
