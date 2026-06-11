# Heimdell Verified Consent API — Demo Validation Milestone

Date: 2026-06-02

This milestone records the current locally validated demo state for the Heimdell Verified Consent API. It is a working demo checkpoint, not a production readiness sign-off.

## Manually Tested And Passed Locally

- Supabase database connected.
- Prisma schema pushed to a fresh Supabase project.
- Supabase Auth user created.
- Password login added and working.
- Internal dashboard user mapped as `OWNER`.
- API sale intake works using `x-api-key`.
- Customer verification link is generated.
- Customer `/v/[token]` page loads.
- Customer consent completion works.
- Certificate row is generated in Supabase.
- `certificateJson` contains evidence.
- Dashboard overview shows live tenant-scoped metrics.
- Sales page shows the verified sale.
- Verifications page shows the completed session.
- Certificates page shows issued certificate metadata.
- Certificate detail page opens.
- Protected PDF download works.
- Dashboard and PDF avoid showing raw tokens, full payment details, and raw certificate JSON.

## Phase 2 Access-Control Proof

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

- `CLIENT_OWNER` can create a `SELLER` staff user.
- `SELLER` user is created under the same organisation: Test Telecom Ltd.
- `SELLER` user is created with `mustChangePassword=true`.
- `SELLER` can log in with temporary password.
- `SELLER` completes forced password change.
- `SELLER` visiting `/dashboard` lands on `/dashboard/my-sales`.
- `SELLER` sidebar shows only My Sales.
- `SELLER` does not see Overview, Sales, Verifications, Certificates, Staff, Settings, Clients, API Keys, Webhooks, or Integrations.

## Phase 5 Seller-Owned Sale Proof

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

## Stale Dashboard Copy Cleanup

- Stale "no auth", "no live data", and "live data locked" dashboard shell/access messaging was reviewed and cleaned from live dashboard surfaces.
- Live dashboard pages now describe protected tenant-scoped data without implying the product is using mock data.
- Unfinished areas still keep honest disabled/incomplete messaging where accurate.
- Deployment readiness now includes the shared no-address legal footer and PWA identity for Heimdell Verified Consent at `https://telecomcompliance.uk`.

## Platform Admin Client Setup Checklist

- A platform-admin-only client setup checklist page now exists at `/dashboard/clients/[organizationId]`.
- The page shows safe organization, client row, client admin, staff, API key, webhook, and activity setup metadata.
- Raw API keys, API key hashes, webhook secrets, tokens, payment details, and customer bank data are not shown.

## Staff Password Reset Flow

- Client owners can reset passwords for eligible staff users in their own organization from `/dashboard/staff`.
- Platform admins and legacy `OWNER` can also reset staff passwords through the same server-side guarded action.
- Temporary passwords are generated server-side, shown once after reset, never stored in plain text, and the staff user is forced to change password on next login.

## Seller-Owned Sale Completion Proof

- Seller-owned sale completion wiring has been verified by `npm run test:seller-completion-proof`.
- The proof confirms `seller_email` intake resolves to same-organization `Sale.submittedByUserId` before sale creation.
- The completion route marks the verification session `COMPLETED`, marks the sale `VERIFIED`, and creates a certificate.
- `/dashboard/my-sales` reads only the logged-in seller's own submitted sales and displays the latest verification status.
- `SELLER` remains blocked from organization-wide sales, verifications, certificates, staff, clients, API keys, webhooks, integrations, and settings.
- Manual browser proof still requires running a fresh sale intake with a client-linked Test Telecom API key, completing the returned `/v/[token]` link, and confirming the seller sees the same sale move from pending to completed.

## Webhook Live Delivery Proof

- Webhook live delivery is worker-based: verification completion queues `WEBHOOK` notification rows, and `npm run webhook:worker` processes them.
- A safe local receiver exists at `npm run webhook:receiver`.
- `npm run test:webhook-live-proof` proves a signed webhook POST reaches a local HTTP receiver, verifies the HMAC signature, and checks that sensitive fields are not included.
- Production still needs a scheduler/queue runner for `npm run webhook:worker` and a real client CRM endpoint test.

## Known Issues

- Magic-link login is unreliable/rate-limited and should not be the primary login flow.
- Email/password login is now the preferred local/demo dashboard login.
- Cooling-off summary currently shows "Not recorded" in certificate detail/PDF despite policies mentioning cooling-off.
- Webhook live delivery has source-level/local-receiver proof; a real client CRM endpoint test is still pending.
- Client company details/settings completion flow needs refinement.
- CRM embedded widget/writeback workflow still needs final production wiring.
- API keys/webhook management remains Heimdell platform-admin only.
- SMS/email customer delivery is not built yet.
- Public signup, billing, and MCP/ChatGPT App are not built yet.

## Next Recommended Steps

1. Test API certificate retrieval.
2. Test webhook dry-run/live worker.
3. Fix cooling-off summary recording.
4. Run the manual browser proof for a fresh seller-owned sale and confirm seller sees status update.
5. Confirm `CLIENT_OWNER` sees the seller-owned sale in organisation-wide Sales page.
6. Add CRM writeback/webhook live delivery test.
7. Consider rotating any demo keys exposed during testing.
8. Continue blocking certificate detail/PDF for `SELLER` unless explicitly changed later.
9. Refine client company details/settings completion.
10. Finish CRM embedded widget/writeback production wiring.
11. Add automated E2E test for the demo loop.

## Safety Notes

- Do not use real customer data for demos.
- Do not expose raw API keys, raw verification tokens, token hashes, API key hashes, encrypted account numbers, full payment details, webhook secrets, full IP/user-agent values, or raw certificate JSON in dashboard, API, widget, logs, or PDF output.
- Continue using tenant-scoped dashboard helpers for any future live dashboard pages.
