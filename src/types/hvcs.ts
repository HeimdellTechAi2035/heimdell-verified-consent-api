// Phase 1 foundations — shared application-level TypeScript types
// These complement the Prisma-generated types for Heimdell Verified Consent System (HVCS).

// ---------------------------------------------------------------------------
// API response envelope types
// ---------------------------------------------------------------------------

export type ApiSuccessResponse<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T = undefined> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Domain summary types (safe subsets returned to API consumers)
// ---------------------------------------------------------------------------

/** Raw verification token before hashing — exists only in memory / URL. */
export type VerificationToken = string;

/** Minimal sale summary safe to return to API clients. */
export type SaleSummary = {
  id: string;
  clientReference?: string | null;
  customerName: string;
  productName: string;
  productPrice: number;
  status: string;
  createdAt: Date;
};

/** Minimal verification session summary. */
export type SessionSummary = {
  id: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

/** Payload returned to a client after successful sale intake. */
export type SaleIntakeResponse = {
  saleId: string;
  sessionToken: VerificationToken;
  verificationUrl: string;
  expiresAt: Date;
};

// ---------------------------------------------------------------------------
// Verification session lookup types
// ---------------------------------------------------------------------------

/** Customer-facing session data — safe subset, no secrets. */
export type SessionLookupData = {
  verification_session_id: string;
  sale_id: string;
  status: string;
  expires_at: Date;
  opened_at: Date | null;
  customer: {
    full_name: string;
    phone: string;
    email: string | null;
    address: string | null;
    sales_channel: string | null;
  };
  product: {
    name: string;
    subscription_price: string;
    subscription_frequency: string | null;
    subscription_terms_summary: string | null;
    policies_summary: string | null;
  };
  direct_debit: {
    bank_name: string;
    sort_code: string;
    account_number_last4: string;
    account_holder_name: string;
  } | null;
  policy_snapshot: {
    termsAndConditions: string;
    coolingOffPolicy: string;
    cancellationInstructions: string;
    privacyEvidenceWording: string;
    directDebitGuaranteeWording: string;
    policyVersion: string;
    capturedAt: string;
  };
  ai_marketing_opt_in: boolean | null;
  cooling_off_days: number | null;
};

export type SessionLookupError =
  | "NOT_FOUND"
  | "EXPIRED"
  | "COMPLETED"
  | "DECLINED";

export type SessionLookupResult =
  | { ok: true; data: SessionLookupData }
  | { ok: false; reason: SessionLookupError };
