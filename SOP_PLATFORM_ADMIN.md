# SOP: Platform Admin

## Purpose

This SOP explains how a Heimdell platform admin sets up and supports a client company on the Heimdell Verified Consent platform.

The platform admin role is responsible for creating client organisations, creating the first client owner, checking setup health, helping with password resets during onboarding, and confirming that the client is ready to run verifications.

## Who This Is For

Use this SOP if you are a Heimdell platform administrator with access to the platform dashboard.

Do not share platform admin access with client users or sales reps.

## Main Responsibilities

- Create new client organisations.
- Create the first client owner/admin login.
- Check client setup status.
- Support client onboarding.
- Reset temporary passwords where needed.
- Review high-level client activity.
- Confirm no secrets, raw API keys, full bank details, or token hashes are exposed.

## Login

1. Open the Heimdell platform URL.
2. Click **Dashboard login**.
3. Enter your platform admin email and password.
4. If asked to change a temporary password, follow the change-password screen.
5. After login, open **Clients** from the dashboard sidebar.

## Create A New Client

1. Go to **Clients**.
2. Click **New Client**.
3. Complete the client form:
   - Company / organisation name
   - Organisation slug
   - Primary contact name
   - Primary contact email
   - Client admin email
   - Temporary password
   - Optional phone
   - Optional internal notes
4. Click **Provision client**.
5. If the page returns an error, check the message and correct the form.
6. After creation, securely provide the client owner with:
   - Login URL
   - Client admin email
   - Temporary password
   - Instruction that they must change password after login

Never send passwords in public channels. Use an approved secure communication method.

## Approve A Self-Serve Signup (Alternative To Manual Creation)

Prospective clients can apply directly at `/signup` without your involvement, submitting company name, Companies House number, ICO registration number, business address, and their own contact details. Use this instead of manual creation when someone has already applied.

1. Go to **Signups**.
2. Review each pending application's Companies House number, ICO registration number, and business address — these are self-reported and not verified against any external register, so use your judgement on whether the company looks legitimate.
3. Click **Approve** to accept. This automatically creates the Supabase Auth user, client record, and owner membership, and emails the applicant their login — no manual step needed.
   - If the confirmation shows a temporary password on screen instead of "login emailed," the automated email failed to send — relay the shown password and login URL to the applicant yourself through an approved secure channel, exactly as in manual creation.
4. Click **Reject** (with a reason) if the details don't look legitimate or the application should not proceed. Rejected applications never appear in **Clients** and cannot be resubmitted from the same email while pending.

## Check Client Setup

1. Go to **Clients**.
2. Open the relevant client company.
3. Review the setup checklist.
4. Check:
   - Organisation details
   - Client owner/admin exists
   - Staff and sellers exist if expected
   - Password status
   - Activity counts
   - Certificates count
   - Webhook status if integrations are used
   - API key metadata if integrations are used
5. Follow the **Recommended next action** shown on the client setup page.

## Reset A Temporary Password

Use this when a client admin, manager, or seller cannot remember their temporary password during setup.

1. Open **Clients**.
2. Open the client company.
3. Find the user in **Client Admins** or **Staff And Sellers**.
4. Click **Reset temporary password**.
5. Copy the newly generated temporary password immediately.
6. Give the user:
   - Login URL
   - Email address
   - Temporary password
   - Instruction: they must change password after login

The temporary password is shown once. Do not refresh or leave the page before copying it.

## What To Confirm Before A Client Pilot

Before telling the client they are ready, confirm:

- Client owner can log in.
- Client owner has changed temporary password.
- Company/policy wording has been reviewed.
- Sellers have been created.
- Seller can log in.
- Seller can create **New Verification**.
- Customer verification link opens.
- Customer can confirm or decline.
- Dashboard updates.
- Certificate opens.
- PDF downloads.
- Payment details are masked.
- No raw API keys, token hashes, full bank account numbers, or secrets are visible.

## Client Support Checklist

If a client reports a problem:

1. Ask which role is affected: client owner, manager, seller, or customer.
2. Ask which page/action failed.
3. Check whether Supabase and the hosting platform are online.
4. Check the client setup page.
5. Check password status.
6. Check whether the verification link has expired.
7. Check whether the customer already completed or declined the link.
8. Check notifications only for delivery status; do not expose provider secrets.

## Security Rules

- Do not share platform admin credentials.
- Do not expose Supabase service role keys.
- Do not expose API keys in browser code.
- Do not expose token hashes.
- Do not expose webhook secrets.
- Do not expose full Direct Debit account numbers.
- Only show temporary passwords once and only to the correct user/contact.
- Use client setup views to inspect safe metadata only.

## Common Outcomes

| Situation | Action |
| --- | --- |
| Client owner forgot temporary password | Reset temporary password from the client setup page |
| Seller forgot temporary password | Reset temporary password from Staff And Sellers |
| Verification link expired | Seller creates a new verification |
| Customer says details are wrong | Customer should decline; seller creates a corrected verification |
| Certificate does not open | Check the certificate belongs to the same organisation and the user has permission |
| PDF does not download | Use the fallback open link on the certificate page |

## Handover To Client

When setup is complete, tell the client owner:

"Your Heimdell Verified Consent account is ready. Please log in, change your temporary password, review your company policy wording, create or review your sellers, and send a test verification before using the platform with live customers."

