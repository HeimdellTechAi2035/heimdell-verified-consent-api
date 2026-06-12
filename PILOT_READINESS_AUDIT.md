# Heimdell Verified Consent Pilot Readiness Audit

Date: 2026-06-12

## Executive Verdict

The Heimdell Verified Consent platform is **CONTROLLED PILOT READY** for a managed demo or limited pilot where Heimdell controls setup, uses fake or approved pilot data, and monitors the first verification runs.

The confirmed main flow works:

seller login -> New Verification -> customer confirms -> dashboard updates -> certificate opens -> PDF downloads.

The remaining risks are not core-flow blockers, but they should be handled before a broader launch: notification provider configuration needs live-provider verification, the standalone lint command is not runnable from this PowerShell PATH, and some older technical/demo documentation still contains placeholder environment examples that should not be treated as production setup text.

## Pass/Fail Checklist

| Area | Check | Status | Notes |
| --- | --- | --- | --- |
| Auth and roles | Platform admin login | Pass | Platform/client setup routes exist and are role-gated for platform roles. |
| Auth and roles | Client owner/manager access | Pass | Client settings, staff, notifications, sales, verifications, and certificates are role-gated. |
| Auth and roles | Seller login | Pass | Seller workspace and My Sales flow exist. Recent E2E confirmed seller flow works. |
| Auth and roles | Seller can only see own sales/certificates | Pass | My Sales uses `submittedByUserId`; certificate detail adds seller scoping server-side. |
| Auth and roles | Client cannot see another client's data | Pass | Dashboard queries scope through organization/client relationships. |
| Main verification flow | Seller New Verification | Pass | Seller New Verification exists and creates Sale, mandate, session, token hash, and verification URL. |
| Main verification flow | Verification link generated | Pass | Created verification returns one-time URL containing the raw token only in the link. |
| Main verification flow | Copy-link fallback works | Pass | Creation success panel/link flow exists; pending links are not re-exposed later. |
| Main verification flow | Customer verification page works | Pass | `/v/[token]` hashes token, rate-limits lookup, and handles expired/completed/declined states. |
| Main verification flow | Customer confirmation works | Pass | E2E confirmed customer confirmation and certificate generation. |
| Main verification flow | Dashboard updates to Verified/Completed | Pass | E2E confirmed dashboard updates. |
| Main verification flow | Certificate page works | Pass | Certificate detail loads via protected dashboard route. |
| Main verification flow | PDF downloads | Pass | PDF route returns PDF bytes with attachment headers and no-store caching. |
| Evidence quality | Payment details masked | Pass | UI/PDF use last four/masked sort code; encrypted account number is not selected for evidence views. |
| Evidence quality | Policy snapshots visible | Pass | Policy snapshot is resolved and shown with legacy fallback handling. |
| Evidence quality | Proof hash visible | Pass | Certificate detail displays proof hash and fingerprint. |
| Evidence quality | Timeline visible | Pass | Certificate timeline is displayed. |
| Evidence quality | Timeline labels are friendly | Pass | Consent event labels are humanized for dashboard/PDF-facing views. |
| Evidence quality | Contract length displays correctly | Pass | Contract length is recovered from the stored terms prefix where no DB column exists. |
| Evidence quality | Subscription summary is not duplicated | Pass | Display helper removes duplicated contract-length prefix from evidence summaries. |
| Client setup and policies | Client setup checklist works | Pass | Overview page includes pilot onboarding checklist with status and links. |
| Client setup and policies | Policy setup page is understandable | Pass | Settings page provides compliance policy editor and clear labels. |
| Client setup and policies | Client policy wording saves correctly | Pass | Save action is server-side and limited to client owner/manager roles. |
| Client setup and policies | Completed certificate snapshots stay unchanged | Pass | Verification creation stores policy snapshot on the sale for immutable evidence. |
| Notifications/delivery | Email delivery status | Partial | Email provider abstraction and status fields exist; live provider credentials/delivery were not tested. |
| Notifications/delivery | SMS delivery status | Partial | Twilio SMS provider abstraction and status fields exist; live delivery was not tested. |
| Notifications/delivery | WhatsApp delivery status | Partial | Optional Twilio WhatsApp path exists; live delivery was not tested. |
| Notifications/delivery | Disabled/not configured providers do not crash | Pass | Missing providers mark notifications skipped instead of crashing delivery. |
| Notifications/delivery | Delivery status visible to seller/admin | Partial | Admin/client notification dashboard is DB-backed; seller visibility appears limited to sale/certificate status rather than full delivery dashboard. |
| Security/privacy | No service role key in browser code | Pass | Service role helper is server-side; no browser-facing code prints the key. |
| Security/privacy | No secrets in docs or committed files | Partial | No real secrets found in tracked docs, but several docs contain placeholder env examples that should be reviewed before public distribution. `.env.local` is present locally and ignored. |
| Security/privacy | No raw bank details in UI/PDF/logs | Pass | Evidence views use masked values; code comments explicitly avoid encrypted/full account values. |
| Security/privacy | Secure links not exposed in wrong places | Pass | Raw verification token is stored only as hash and only returned inside the intended one-time URL. |
| Demo readiness | `PILOT_DEMO_SCRIPT.md` exists | Pass | Demo script exists. |
| Demo readiness | Demo can be followed without PowerShell | Pass | Script walks through dashboard/customer/PDF flow. |
| Demo readiness | Fake test data included | Pass | Fake data is included and uses safe non-live customer/payment details. |
| Demo readiness | Known limitations documented | Pass | Script avoids overclaiming and documents safe wording. |
| Demo readiness | No regulator approval/legal guarantee claims | Pass | Script explicitly says not to claim regulator approval or guaranteed legal protection. |

## Blockers Table

| Severity | Blocker | Impact | Recommendation |
| --- | --- | --- | --- |
| Critical | None found for controlled pilot | The core E2E flow is working. | Proceed only with managed/fake-data pilot controls. |
| High | Live email/SMS/WhatsApp provider delivery not verified | A real pilot may rely on manual copy-link unless providers are configured and tested. | Configure provider credentials in server env, run worker in dry run, then send test-only notifications. |
| High | Standalone `npm run lint` could not be executed from this shell | Release checklist cannot be reproduced exactly until Node/npm PATH is fixed. | Add Node/npm to PATH or document use of bundled/local binaries; keep build as required gate. |
| Medium | Tracked docs include placeholder env examples | Safe placeholders, but could confuse non-technical readers or be copied incorrectly. | Separate public/client docs from internal setup docs before wider distribution. |
| Medium | Notification dashboard visibility is admin/client-focused | Sellers may not see detailed delivery status directly. | Decide whether sellers need notification status or only verification/certificate status. |
| Low | Some source comments contain mojibake/phase wording | Not visible to normal users, but untidy for repo quality. | Clean comments in a later housekeeping pass. |

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint` | Blocked | `npm` is not on PATH in this PowerShell session. |
| `npx tsc --noEmit` | Blocked | `npx` is not on PATH in this PowerShell session. |
| Local equivalent: `node node_modules/typescript/bin/tsc --noEmit` | Pass | Completed successfully with no TypeScript errors. |
| Local equivalent: `node node_modules/next/dist/bin/next lint` | Inconclusive | Timed out without useful output. |
| Local fallback: `node node_modules/eslint/bin/eslint.js .` | Inconclusive | Tried to lint `.next` generated build output and failed on a missing generated manifest. |
| Local equivalent: `node node_modules/next/dist/bin/next build` | Pass | Production build compiled successfully; Next build also ran linting/type validity phase. |
| `git diff --check` | Pass | No whitespace errors; Git reported line-ending warnings for existing modified files. |
| `npx prisma migrate status` | Blocked | `npx` is not on PATH. |
| Local equivalent with `.env.local`: `dotenv -e .env.local -- node node_modules/prisma/build/index.js migrate status` | Pass | 9 migrations found; database schema is up to date. No migrations applied. |

## Migration Status

Prisma reports 9 migrations and the database schema is up to date:

1. `20260525000000_initial_schema`
2. `20260525001000_add_user_external_auth_id`
3. `20260526000000_add_webhook_retry_fields`
4. `20260602000000_add_dashboard_role_levels`
5. `20260602001000_add_client_provisioning_fields`
6. `20260602002000_add_sale_submitted_by_user`
7. `20260603001000_add_organization_archive_fields`
8. `20260612000000_add_policy_snapshots`
9. `20260612001000_add_notification_delivery_fields`

No destructive migration command was run. Before any live deployment, take a database backup and review the two June 12 migrations because they add policy snapshot and notification delivery fields used by the new pilot evidence flow.

## Files Inspected

- `src/lib/dashboard-auth.ts`
- `src/lib/dashboard-role-policy.ts`
- `src/lib/dashboard-sales.ts`
- `src/lib/dashboard-certificate-detail.ts`
- `src/lib/sale-evidence-display.ts`
- `src/lib/dashboard-new-verification.ts`
- `src/lib/dashboard-notifications.ts`
- `src/lib/notification-providers.ts`
- `src/lib/notification-delivery.ts`
- `src/app/v/[token]/page.tsx`
- `src/app/dashboard/overview/page.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/app/dashboard/settings/actions.ts`
- `src/app/dashboard/notifications/page.tsx`
- `src/app/dashboard/my-sales/page.tsx`
- `src/app/dashboard/my-sales/[id]/page.tsx`
- `src/app/dashboard/certificates/[id]/page.tsx`
- `src/app/dashboard/certificates/[id]/pdf/route.ts`
- `src/app/api/v1/embed/verifications/route.ts`
- `PILOT_DEMO_SCRIPT.md`
- `PILOT_E2E_TEST_CHECKLIST.md`
- `CRM_INTEGRATION.md`
- `prisma/schema.prisma`
- `prisma/migrations/*`

## Security Notes

- Seller certificate access is server-scoped by organization and `submittedByUserId`.
- Client/admin dashboard queries scope through organization/client relationships.
- The PDF export route uses the same protected certificate detail loader and does not let audit logging failure block the PDF response.
- Raw verification tokens are hashed before storage. The raw token appears only in the intended verification URL.
- Full Direct Debit account numbers are encrypted for storage and evidence views use masked/last-four data.
- Webhook secrets, API key hashes, token hashes, encrypted account numbers, and service role keys are not selected for user-facing evidence pages.
- The repository has a local `.env.local`, but it is not shown in `git status` and should remain untracked.

## Next 5 Recommended Actions

1. Fix local Node/npm PATH so `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx prisma migrate status` can be run exactly as documented.
2. Run one controlled notification test with provider credentials in a non-production or approved pilot environment, then verify the notification dashboard shows sent/failed/skipped correctly.
3. Review public-facing docs and separate internal setup documentation that contains placeholder env examples.
4. Rehearse the full demo once from a fresh browser session using fake data, including seller login, customer confirm, certificate page, and PDF download.
5. Keep the pilot audit updated after the first live provider test.

## Final Verdict

**CONTROLLED PILOT READY**

Use for an internal demo or closely managed pilot. Do not present it as broad launch-ready until notification delivery is provider-tested, the exact npm/npx toolchain works on the deployment machine, and the client-facing demo/docs polish issues are cleaned.
