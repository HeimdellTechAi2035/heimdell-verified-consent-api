# Client Onboarding Flow

This document describes the Phase 2 platform-admin client/company provisioning flow.

## Purpose

Heimdell platform admins can onboard a new client company without editing `.env.local` or running setup scripts for normal users.

This flow creates:

- a tenant `Organization`
- a Supabase Auth user for the first client admin
- an internal Heimdell `User`
- an `OrganizationMembership`
- a first-login password-change requirement

It does not create public signup, billing, SMS/email delivery, MCP, or client-visible API key/webhook/integration management.

## Required Environment

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-server-only-service-role-key"
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it in browser code, never prefix it with `NEXT_PUBLIC_`, and never put it in widget or client-side configuration.

## Required Migration

The provisioning form depends on these additive schema fields:

- `User.mustChangePassword`
- `Organization.primaryContactName`
- `Organization.primaryContactEmail`
- `Organization.primaryContactPhone`
- `Organization.notes`

Apply migrations locally with:

```bash
npm run db:migrate:dev
```

Apply migrations in production with:

```bash
npm run db:migrate:deploy
```

Do not use `db push` for this workflow.

## Platform Admin Workflow

1. Sign in as a `PLATFORM_ADMIN` or temporary legacy `OWNER`.
2. Open `/dashboard/clients/new`.
3. Enter:
   - company / organization name
   - organization slug
   - primary contact name
   - primary contact email
   - first client admin email
   - temporary password
   - optional phone
   - optional notes
4. Submit the form.
5. Open `/dashboard/clients/[organizationId]` from the Clients page to check setup status.
6. Share the temporary password with the client admin through an approved secure channel.

The temporary password is sent only to Supabase Auth. Heimdell does not store it.

## First Client Admin Login

1. Client admin signs in at `/login` with email and temporary password.
2. The dashboard redirects them to `/dashboard/change-password`.
3. They enter the temporary password and a new password.
4. Supabase updates the password.
5. Heimdell clears `User.mustChangePassword`.
6. The user is redirected to `/dashboard`.

## Staff Password Resets

Client owners can reset eligible staff passwords from `/dashboard/staff`.

1. Open `/dashboard/staff`.
2. Choose `Reset password` for the staff member.
3. Confirm the reset.
4. Copy the temporary password shown on screen.
5. Give it to the staff member through an approved secure channel.

The temporary password is generated server-side, shown once, and never stored in plain text. The staff member must change it at `/dashboard/change-password` before accessing normal dashboard pages. Client owners can reset staff roles such as `CLIENT_MANAGER`, `SELLER`, and `COMPLIANCE_VIEWER` in their own organization only; they cannot reset another client owner or users from another organization.

## Role Assignment

The intended first client admin role is `CLIENT_OWNER`.

If the database enum migration for `CLIENT_OWNER` has not been applied yet, provisioning falls back to legacy `ADMIN` so local demo compatibility is preserved. Apply the role migration before production onboarding.

## Access Boundaries

Client users cannot access:

- `/dashboard/clients`
- `/dashboard/clients/new`
- `/dashboard/api-keys`
- `/dashboard/webhooks`
- `/dashboard/integrations`
- other companies' tenant data

Sidebar hiding is only a UI convenience. Server-side guards still enforce access on protected routes and actions.

## Phase 2 Access-Control Proof

The following were manually tested and passed locally:

- Platform admin can access `/dashboard/clients/new`.
- Platform admin can provision a new client company.
- Provisioning creates an `Organization` row.
- Provisioning creates a Supabase Auth user.
- Provisioning creates an internal `User` record.
- Provisioning creates an `OrganizationMembership` record.
- New client admin is assigned `CLIENT_OWNER`.
- New client admin logs in successfully.
- New client admin completed forced password change.
- New client admin sees only their own organization: Test Telecom Ltd.
- New client admin dashboard starts empty and does not show Heimdell Demo Organization data.
- Client admin sidebar does not show Clients, New Client, API Keys, Webhooks, or Integrations.
- Manual access to `/dashboard/api-keys` returns Access denied.
- Manual access to `/dashboard/webhooks` returns Access denied.
- Manual access to `/dashboard/integrations` returns Access denied.

## Phase 4 Seller Dashboard Proof

The following were manually tested and passed locally:

- `CLIENT_OWNER` can create a `SELLER` staff user.
- `SELLER` user is created under the same organisation: Test Telecom Ltd.
- `SELLER` user is created with `mustChangePassword=true`.
- `SELLER` can log in with temporary password.
- `SELLER` completes forced password change.
- `SELLER` visiting `/dashboard` lands on `/dashboard/my-sales`.
- `SELLER` sidebar shows only My Sales.
- `SELLER` does not see Overview, Sales, Verifications, Certificates, Staff, Settings, Clients, API Keys, Webhooks, or Integrations.

## Phase 5 Seller-Owned Sale Proof

The following were manually tested and passed locally:

- `Sale.submittedByUserId` migration was applied successfully.
- Test Telecom Ltd Client row was created through the backfill/provisioning repair.
- Platform admin created an API key for Test Telecom Ltd Client.
- Heimdell Demo API key was rejected when trying to attach sale ownership to Test Telecom seller.
- Test Telecom API key successfully submitted sale `SELLER-001` with `seller_email` `seller1@testtelecom.local`.
- Sale intake returned `ok: true`, `sale_id`, `verification_session_id`, `verification_url`, and status `PENDING`.
- Seller user `seller1@testtelecom.local` logged in successfully.
- `/dashboard/my-sales` showed only `SELLER-001` for that seller.
- Seller My Sales displayed safe fields only: reference, product, price, sale status, verification status, created date.
- Seller did not see organisation-wide sales.
- Leaked Test Telecom API key was revoked after screenshot exposure.

## Seller Sale Lifecycle

When a client backend submits sale intake with a valid same-organization `seller_email`, Heimdell links the sale to that internal dashboard user through `Sale.submittedByUserId`.

Lifecycle:

1. Client backend submits `POST /api/v1/sales/intake` with `seller_email`.
2. Heimdell verifies the seller belongs to the authenticated API key's organization.
3. Seller sees the sale on `/dashboard/my-sales` with pending sale/verification status.
4. Customer opens `/v/[token]` and completes the consent confirmation.
5. Heimdell marks the verification session `COMPLETED`, marks the sale `VERIFIED`, and creates a certificate.
6. Seller sees the same sale update on `/dashboard/my-sales`.
7. Client owner/manager users can review the sale and verification from their organization-scoped dashboard pages.

Seller users still cannot access organization-wide sales, verifications, certificates, staff, API keys, webhooks, integrations, clients, settings, certificate detail, or certificate PDF routes.

## Current Limitations

- Platform admins can inspect client setup status from `/dashboard/clients/[organizationId]`.
- API key, webhook, and integration settings remain platform-admin-only.
- There is no public signup.
- There is no automated email invitation delivery in this phase.
- Platform admins must communicate temporary credentials out of band using an approved secure process.
- Sale ownership tracking now uses nullable `Sale.submittedByUserId`.
- Sale intake can attach ownership with optional `seller_email` when the email belongs to a permitted user in the same organization as the authenticated API client/key.
- Payloads without `seller_email` continue to work and create sales without seller dashboard ownership.
- `Sale.agentId` remains a legacy/external CRM reference and is not trusted dashboard user ownership.
- `/dashboard/my-sales` displays only the logged-in seller's own submitted sales once the seller email is included during intake.
- Complete customer verification for the seller-owned sale and confirm seller sees status update.
- Confirm `CLIENT_OWNER` sees the seller-owned sale in organisation-wide Sales page.
- Add CRM writeback/webhook live delivery test.
- Consider rotating any demo keys exposed during testing.
- Certificate detail/PDF remains blocked for `SELLER` unless explicitly changed later.
- Client company details/settings completion flow needs refinement.
- CRM embedded widget/writeback workflow still needs final production wiring.
- Webhook delivery still needs a live test.
- API keys/webhook management remains Heimdell platform-admin only.
