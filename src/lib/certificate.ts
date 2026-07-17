// Phase 4 — consent certificate generation

import { createHash } from "crypto";
import type { Client, DirectDebitMandate, Sale, VerificationSession } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

type SharedAcknowledgements = {
  terms_acknowledged: boolean;
  policies_acknowledged: boolean;
  cooling_off_acknowledged: boolean;
  direct_debit_authorised: boolean;
  evidence_storage_acknowledged: boolean;
  /** false when AI consent was not part of this verification (field not collected). */
  ai_consent_confirmed: boolean;
};

/** Evidence collected from the customer at the point of completion via the web link. */
export type WebCertificateEvidence = SharedAcknowledgements & {
  method: "web";
  typed_name: string;
  ip_address: string | null;
  user_agent: string | null;
  completed_at: Date;
  /** Not part of the certificate hash -- carried through only to enrich the ConsentEvent audit payload. */
  confirm_details_correct: boolean;
  confirm_product_price_frequency: boolean;
};

/**
 * Evidence collected from a customer who confirmed via an automated phone
 * call (pressed 1 after hearing the full disclosure read out). The
 * acknowledgement booleans are all true together -- the call has no
 * granular per-item confirmation, only one bundled keypress at the end.
 * Recording URL/duration are supplementary evidence tracked on
 * PhoneVerificationAttempt, not part of the certificate -- they arrive
 * asynchronously after the certificate is already created.
 */
export type PhoneCertificateEvidence = SharedAcknowledgements & {
  method: "phone_call";
  call_sid: string;
  digits_pressed: string;
  phone_number: string;
  call_completed_at: Date;
};

/**
 * Evidence from the conversational AI voice agent -- unlike
 * PhoneCertificateEvidence, the acknowledgement booleans here reflect real
 * per-item confirmations captured live during the call (see
 * voice-agent-service/src/consent-events.ts), not a single bundled keypress.
 * The granular ConsentEvent rows are written as the call happens, so
 * completeVerificationSession() must not re-create them for this method --
 * only the final VERIFICATION_COMPLETED event is added at completion time.
 */
export type ConversationalPhoneCertificateEvidence = SharedAcknowledgements & {
  method: "phone_call_agent";
  call_sid: string;
  phone_number: string;
  call_completed_at: Date;
};

export type CertificateEvidence =
  | WebCertificateEvidence
  | PhoneCertificateEvidence
  | ConversationalPhoneCertificateEvidence;

/**
 * Safe mandate subset — excludes encryptedAccountNumber.
 * The route should select only these fields when querying.
 */
export type SafeMandate = Pick<
  DirectDebitMandate,
  "id" | "bankName" | "sortCode" | "accountNumberLast4" | "accountHolderName"
>;

export type CertificateInput = {
  session: VerificationSession;
  sale: Sale & {
    client: Client;
    directDebitMandate: SafeMandate | null;
  };
  evidence: CertificateEvidence;
};

// ---------------------------------------------------------------------------
// Certificate builder
// ---------------------------------------------------------------------------

/**
 * Build the immutable consent certificate payload.
 *
 * Returns the full payload (to be stored as certificateJson) and a
 * deterministic proofHash over the canonical fields.
 *
 * Security:
 *   - Never includes encryptedAccountNumber or the raw account number.
 *   - Never includes tokenHash.
 *   - proofHash is SHA-256 of a sorted canonical field subset.
 */
export function createCertificateJson(input: CertificateInput): {
  payload: Record<string, unknown>;
  proofHash: string;
} {
  const { session, sale, evidence } = input;
  const dd = sale.directDebitMandate;

  const sharedPayload: Record<string, unknown> = {
    _version: "1",
    service: "Heimdell Verified Consent API",

    // Session / sale identifiers
    verification_id: session.id,
    sale_id: sale.id,
    client_id: sale.clientId,
    client_reference: sale.clientReference ?? null,
    agent_id: sale.agentId ?? null,

    // Customer
    customer_name: sale.customerName,
    customer_phone: sale.customerPhone ?? null,
    customer_email: sale.customerEmail ?? null,
    customer_address: sale.customerAddress ?? null,

    // Product
    product_name: sale.productName,
    subscription_price: sale.productPrice.toString(),
    subscription_frequency: sale.productFrequency ?? null,
    terms_summary: sale.productTerms ?? null,
    policies_summary: sale.productPolicies ?? null,
    sales_channel: sale.salesChannel ?? null,
    ai_marketing_opt_in: sale.aiMarketingOptIn ?? null,
    cooling_off_days: sale.coolingOffDays ?? null,

    // Direct Debit (safe fields only — no full account number)
    direct_debit_bank_name: dd?.bankName ?? null,
    direct_debit_sort_code: dd?.sortCode ?? null,
    direct_debit_account_last4: dd?.accountNumberLast4 ?? null,
    direct_debit_account_holder: dd?.accountHolderName ?? null,

    // Consent evidence
    verification_method: evidence.method,
    direct_debit_authorised: evidence.direct_debit_authorised,
    terms_acknowledged: evidence.terms_acknowledged,
    policies_acknowledged: evidence.policies_acknowledged,
    cooling_off_acknowledged: evidence.cooling_off_acknowledged,
    evidence_storage_acknowledged: evidence.evidence_storage_acknowledged,
    ai_consent_confirmed: evidence.ai_consent_confirmed,
  };

  if (evidence.method === "web") {
    const payload: Record<string, unknown> = {
      ...sharedPayload,
      typed_name: evidence.typed_name,
      completed_at: evidence.completed_at.toISOString(),
      ip_address: evidence.ip_address,
      user_agent: evidence.user_agent,
    };

    // Unchanged from before the phone-call evidence branch existed — new
    // web certificates must hash identically to what this code always
    // produced, so existing certificates' proof remains meaningful.
    const canonicalFields: Record<string, unknown> = {
      verification_id: payload.verification_id,
      sale_id: payload.sale_id,
      client_id: payload.client_id,
      client_reference: payload.client_reference,
      customer_name: payload.customer_name,
      product_name: payload.product_name,
      subscription_price: payload.subscription_price,
      subscription_frequency: payload.subscription_frequency,
      direct_debit_sort_code: payload.direct_debit_sort_code,
      direct_debit_account_last4: payload.direct_debit_account_last4,
      direct_debit_authorised: payload.direct_debit_authorised,
      terms_acknowledged: payload.terms_acknowledged,
      policies_acknowledged: payload.policies_acknowledged,
      cooling_off_acknowledged: payload.cooling_off_acknowledged,
      typed_name: payload.typed_name,
      completed_at: payload.completed_at,
      sales_channel: payload.sales_channel,
      ai_marketing_opt_in: payload.ai_marketing_opt_in,
      ai_consent_confirmed: payload.ai_consent_confirmed,
    };

    return { payload, proofHash: hashCanonicalFields(canonicalFields) };
  }

  // "phone_call" (legacy DTMF) and "phone_call_agent" (conversational voice
  // agent) share this whole shape except digits_pressed, which only the
  // legacy method has -- kept as one branch (rather than a third near-
  // duplicate block) so the existing "phone_call" hash computation stays
  // byte-identical to what it always produced.
  const isLegacyPhoneCall = evidence.method === "phone_call";

  const payload: Record<string, unknown> = {
    ...sharedPayload,
    call_sid: evidence.call_sid,
    ...(isLegacyPhoneCall ? { digits_pressed: evidence.digits_pressed } : {}),
    phone_number: evidence.phone_number,
    completed_at: evidence.call_completed_at.toISOString(),
  };

  const canonicalFields: Record<string, unknown> = {
    verification_id: payload.verification_id,
    sale_id: payload.sale_id,
    client_id: payload.client_id,
    client_reference: payload.client_reference,
    customer_name: payload.customer_name,
    product_name: payload.product_name,
    subscription_price: payload.subscription_price,
    subscription_frequency: payload.subscription_frequency,
    direct_debit_sort_code: payload.direct_debit_sort_code,
    direct_debit_account_last4: payload.direct_debit_account_last4,
    direct_debit_authorised: payload.direct_debit_authorised,
    terms_acknowledged: payload.terms_acknowledged,
    policies_acknowledged: payload.policies_acknowledged,
    cooling_off_acknowledged: payload.cooling_off_acknowledged,
    verification_method: payload.verification_method,
    call_sid: payload.call_sid,
    ...(isLegacyPhoneCall ? { digits_pressed: payload.digits_pressed } : {}),
    phone_number: payload.phone_number,
    completed_at: payload.completed_at,
    sales_channel: payload.sales_channel,
    ai_marketing_opt_in: payload.ai_marketing_opt_in,
    ai_consent_confirmed: payload.ai_consent_confirmed,
  };

  return { payload, proofHash: hashCanonicalFields(canonicalFields) };
}

function hashCanonicalFields(canonicalFields: Record<string, unknown>): string {
  // Deterministic proof hash — sorted keys so field order doesn't matter.
  const sortedCanonical = Object.fromEntries(
    Object.entries(canonicalFields).sort(([a], [b]) => a.localeCompare(b))
  );

  return createHash("sha256").update(JSON.stringify(sortedCanonical)).digest("hex");
}

// ---------------------------------------------------------------------------
// Safe API response mapper
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a Certificate record with the relations needed for the
 * safe API response. The route must select exactly these fields.
 *
 * Security: tokenHash, apiKeyHash, and encryptedAccountNumber must never
 * be included in the query — they are absent from this type by design.
 */
export type CertificateWithRelations = {
  id: string;
  verificationSessionId: string;
  certificateJson: Record<string, unknown>;
  proofHash: string;
  createdAt: Date;
  verificationSession: {
    id: string;
    sale: {
      id: string;
      clientId: string;
      clientReference: string | null;
    };
  };
};

export type SafeCertificateResponse = {
  ok: true;
  certificate_id: string;
  verification_session_id: string;
  sale_id: string;
  client_reference: string | null;
  status: "COMPLETED";
  created_at: string;
  proof_hash: string;
  certificate: Record<string, unknown>;
};

function maskCertificateSortCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 2) {
    return "**";
  }

  return `**-**-${digits.slice(-2)}`;
}

export function mapCertificateJsonToSafeApiSummary(
  certificateJson: Record<string, unknown>
): Record<string, unknown> {
  const safeCertificate = { ...certificateJson };
  const directDebitSortCode = safeCertificate.direct_debit_sort_code;

  delete safeCertificate.customer_phone;
  delete safeCertificate.customer_email;
  delete safeCertificate.customer_address;
  delete safeCertificate.direct_debit_bank_name;
  delete safeCertificate.direct_debit_sort_code;
  delete safeCertificate.direct_debit_account_holder;
  delete safeCertificate.ip_address;
  delete safeCertificate.user_agent;
  delete safeCertificate.phone_number;

  return {
    ...safeCertificate,
    direct_debit_sort_code_masked: maskCertificateSortCode(
      directDebitSortCode
    ),
  };
}

/**
 * Map a Certificate DB record to the safe public API response shape.
 *
 * Never exposes: tokenHash, apiKeyHash, encryptedAccountNumber,
 * raw customer contact details, full bank details, full IP/user-agent,
 * internal Prisma relation objects, or raw token values.
 */
export function mapCertificateToSafeResponse(
  cert: CertificateWithRelations
): SafeCertificateResponse {
  return {
    ok: true,
    certificate_id: cert.id,
    verification_session_id: cert.verificationSessionId,
    sale_id: cert.verificationSession.sale.id,
    client_reference: cert.verificationSession.sale.clientReference,
    status: "COMPLETED",
    created_at: cert.createdAt.toISOString(),
    proof_hash: cert.proofHash,
    certificate: mapCertificateJsonToSafeApiSummary(cert.certificateJson),
  };
}
