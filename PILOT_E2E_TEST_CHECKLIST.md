# Heimdell Verified Consent API - Pilot E2E Test Checklist

Use this checklist before sending real customer verification links in a pilot.
Run it against the intended staging or pilot environment after migrations and
environment configuration are complete.

## 1. Platform setup

- [ ] Platform admin logs in successfully.
- [ ] Platform admin creates a client organization.
- [ ] Client record has the correct company name, contact email, and active status.
- [ ] Client admin user is created with a temporary password.

## 2. Client admin onboarding

- [ ] Client admin logs in with the temporary password.
- [ ] Client admin is redirected to change password when required.
- [ ] Client admin changes password.
- [ ] Client admin lands on the dashboard without manually refreshing.
- [ ] Client admin reviews company settings.
- [ ] Client admin edits or confirms policy wording:
  - [ ] Terms and Conditions
  - [ ] Cooling-off Policy
  - [ ] Cancellation Instructions
  - [ ] Privacy and Evidence Storage Wording
  - [ ] Direct Debit Guarantee Wording
  - [ ] Policy Version

## 3. Seller setup

- [ ] Client admin creates a seller.
- [ ] Seller receives or is given login details.
- [ ] Seller logs in with temporary password.
- [ ] Seller changes password.
- [ ] Seller lands on My Sales without manually refreshing.
- [ ] Seller cannot access other sellers' sales.

## 4. Seller New Verification

- [ ] Seller opens My Sales.
- [ ] Seller clicks New Verification.
- [ ] Seller enters customer details:
  - [ ] Full name
  - [ ] Phone
  - [ ] Optional valid email
  - [ ] Address
- [ ] Seller enters sale details:
  - [ ] Product/service name
  - [ ] Price
  - [ ] Frequency
  - [ ] Contract length if applicable
  - [ ] Terms summary
  - [ ] Policies summary
  - [ ] Sales channel
- [ ] Seller enters Direct Debit details:
  - [ ] Bank name
  - [ ] Sort code
  - [ ] Account number
  - [ ] Account holder name
- [ ] Seller clicks Send Verification.
- [ ] Success panel shows Pending status and the secure verification link.
- [ ] Seller copies the verification link.

## 5. Customer verification

- [ ] Customer opens the secure verification link.
- [ ] Customer sees customer details.
- [ ] Customer sees product, price, frequency, and contract details.
- [ ] Customer sees masked payment details only.
- [ ] Customer sees terms summary and policies summary.
- [ ] Customer sees full policy snapshot wording:
  - [ ] Terms and Conditions
  - [ ] Cooling-off Policy
  - [ ] Cancellation Instructions
  - [ ] Privacy and Evidence Storage Wording
  - [ ] Direct Debit Guarantee Wording
  - [ ] Policy version and captured timestamp
- [ ] Customer must tick separate consent checkboxes.
- [ ] Customer must type their name.
- [ ] Customer confirms successfully.
- [ ] Repeat once with customer decline and confirm declined state is recorded.

## 6. Dashboard updates

- [ ] Sales page shows the sale with customer, seller, product, price, and status.
- [ ] My Sales shows only the seller's own sale.
- [ ] Verifications page shows Pending, Completed, Declined, or Expired clearly.
- [ ] Detail pages show customer, seller, product, price, timestamps, and status.
- [ ] Pending links are not exposed after the one-time creation screen.

## 7. Certificate and PDF

- [ ] Certificate detail opens for the completed verification.
- [ ] Certificate detail shows customer, seller, company, product, price, policy snapshot, typed name, timeline, and proof hash.
- [ ] PDF downloads successfully.
- [ ] PDF includes the human-readable evidence sections.
- [ ] Seller can open certificates only for their own submitted sales.
- [ ] Seller cannot open certificates for another seller or another organization.

## 8. Notifications

- [ ] Verification creation creates notification records where customer contact details are available.
- [ ] Notification dashboard shows recipient, channel, type, status, attempts, timestamps, and safe error message if applicable.
- [ ] Provider credentials missing state is handled without breaking verification creation.
- [ ] If providers are configured, queued notifications move to Sent or Failed with delivery tracking.

## 9. CRM embed, if configured

- [ ] CRM backend creates short-lived signed embed access.
- [ ] Browser code does not use a private API key.
- [ ] CRM embed opens the verification workflow.
- [ ] Embed creates a verification.
- [ ] Embed refreshes status.
- [ ] Embed shows certificate link when completed.
- [ ] CRM stores:
  - [ ] `hvcs_sale_id`
  - [ ] `hvcs_verification_session_id`
  - [ ] `hvcs_verification_status`
  - [ ] `hvcs_verification_url`
  - [ ] `hvcs_certificate_id`
  - [ ] `hvcs_certificate_url`
  - [ ] `hvcs_completed_at`
  - [ ] `hvcs_declined_reason`
  - [ ] `hvcs_last_webhook_event`

## 10. Security checks

- [ ] No raw API keys are visible in browser code or dashboard pages.
- [ ] No token hashes are visible.
- [ ] No full Direct Debit account number is visible.
- [ ] No encrypted payment value is visible.
- [ ] No webhook secret is visible after setup.
- [ ] No encryption key or provider secret is visible.
- [ ] Seller cannot access another seller's sales, verifications, or certificates.
- [ ] Expired links cannot be completed.
- [ ] Declined links cannot be completed later.
- [ ] Completed links cannot create duplicate certificates.
