# Heimdell Verified Consent Pilot Demo Script

## 1. Demo Purpose

Heimdell Verified Consent helps telecom and subscription sales businesses prove what a customer agreed to after a sale.

The platform creates a secure post-sale verification record. A seller enters the customer, product, terms, policy, and payment authority details. The customer then opens a secure verification link, reviews the full sale information, confirms or declines, and Heimdell creates a timestamped evidence record and downloadable certificate.

The purpose of the demo is to show how a business can reduce disputes, support compliance reviews, and improve sales quality control by keeping a clear record of what the customer saw, accepted, and confirmed.

## 2. Demo Roles

**Platform admin**

Sets up client companies, checks that the client account is ready, and supports onboarding.

**Client owner/manager**

Reviews company policy wording, manages sellers, monitors verification activity, and reviews certificates.

**Seller**

Creates a new verification after a sale, enters customer and sale details, and sends the secure verification link.

**Customer**

Reviews the sale, terms, cooling-off rights, privacy/evidence wording, and payment authority before confirming or declining.

## 3. Demo Flow Summary

1. Platform/admin confirms the client is set up.
2. Client policy wording is reviewed.
3. Seller logs in.
4. Seller creates a New Verification.
5. Customer opens the secure verification link.
6. Customer reviews sale details, terms, cooling-off rights, privacy/evidence wording, and payment authority.
7. Customer confirms.
8. Seller dashboard updates to Verified/Completed.
9. Certificate evidence is generated.
10. PDF is downloaded.
11. Admin/client can review the evidence.

## 4. Talk Track

"Heimdell Verified Consent is designed for sales teams that need a clear record of customer consent after a telecom or subscription sale.

Instead of relying only on notes, call recordings, or manual paperwork, the seller sends the customer a secure verification link. The customer can review the key details of the sale: who they are buying from, what product they are taking, the price, the contract length, the terms, the cooling-off wording, the privacy and evidence wording, and the payment authority.

The customer then confirms or declines. If they confirm, Heimdell records the event with timestamps, the policy wording shown at that moment, consent confirmations, masked payment evidence, and a proof hash. This creates a certificate that can be reviewed later by managers, compliance teams, or customer support.

The aim is to reduce disputes, improve evidence quality, and help the business show what the customer saw and accepted. Payment details are masked in the dashboard and certificate, while the evidence record preserves the important proof points needed for audit support and complaint handling.

For a sales business, this means a cleaner process after the sale, better visibility for managers, and a downloadable certificate that supports internal quality control."

## 5. Test Data To Use

Use safe fake data only.

| Field | Test value |
| --- | --- |
| Customer name | Jane Pilot Test |
| Phone | 07123 456789 |
| Email | [jane.pilot.test@example.com](mailto:jane.pilot.test@example.com) |
| Address | 1 Pilot Street, Preston, PR1 1AA |
| Product | Broadband Compliance Test |
| Price | £29.99 |
| Frequency | Monthly |
| Contract length | 12 months |
| Sales channel | Online |
| Bank | Test Bank |
| Sort code | 12-34-56 |
| Account number | 12345678 |
| Account holder | Jane Pilot Test |

## 6. What To Check During Demo

- Seller dashboard loads.
- New Verification form loads.
- Verification link is generated.
- Customer page shows policy wording.
- Customer can confirm.
- Seller dashboard updates.
- Certificate page opens.
- PDF downloads.
- Payment details are masked.
- Timeline and proof hash are visible.

## 7. Known Limitations / Safe Wording

Use careful wording during the demo.

Do say:

- "Consent evidence"
- "Post-sale verification"
- "Audit support"
- "Dispute reduction infrastructure"
- "Sales quality control"
- "Evidence record"

Do not say:

- "Regulator approved"
- "Guaranteed legal protection"
- "This prevents all complaints"
- "This replaces legal advice"
- "This proves compliance in every situation"

Suggested wording:

"Heimdell provides structured consent evidence and audit support. It helps the business show what the customer reviewed and confirmed, but it does not replace legal advice or guarantee the outcome of any complaint or regulatory review."

## 8. Pilot Offer Positioning

**Managed pilot for sales teams that need proof of customer consent.**

The first commercial offer can be positioned as a managed pilot for telecom or subscription sales teams. Heimdell helps set up the client account, configure policy wording, create seller access, send customer verification links, generate certificate evidence, and provide reporting on verification outcomes.

The pilot should focus on proving the operational value:

- Sellers can send verification links quickly.
- Customers can confirm the sale clearly.
- Managers can see verification status.
- Certificates provide useful evidence for audits, complaints, and sales quality checks.
- Payment evidence remains masked in user-facing records.

## 9. Final Demo Close

This gives your business a clear record of what the customer saw, accepted, and confirmed, with a certificate you can use for audits, complaints, and internal sales quality control.

## Demo Pass/Fail Checklist

| Step | Pass criteria | Pass/Fail |
| --- | --- | --- |
| Client setup | Client account exists and dashboard opens |  |
| Policy review | Policy wording is visible in settings/customer flow |  |
| Seller login | Seller can log in and reach seller dashboard |  |
| New Verification | Seller can create a verification without API keys or JSON |  |
| Verification link | Secure link is generated and can be opened |  |
| Customer review | Customer sees sale, terms, cooling-off, privacy/evidence, and payment authority |  |
| Customer confirmation | Customer can confirm successfully |  |
| Dashboard update | Sale/verification status updates to completed/verified |  |
| Certificate page | Certificate evidence page opens |  |
| PDF download | Certificate PDF downloads or opens |  |
| Masked payment | Full account number is not visible |  |
| Evidence quality | Timeline, timestamps, policy snapshot, and proof hash are visible |  |
