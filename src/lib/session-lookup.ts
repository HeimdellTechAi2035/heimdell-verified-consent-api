// Phase 3 — Shared verification session lookup logic
// Used by the REST API route AND the customer page (server component),
// avoiding an internal HTTP hop.

import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { resolveSalePolicySnapshot } from "@/lib/client-policy";
import type {
  SessionLookupData,
  SessionLookupResult,
} from "@/types/hvcs";

export type { SessionLookupData, SessionLookupResult } from "@/types/hvcs";

/**
 * Look up a verification session by its raw (URL) token.
 *
 * - Hashes the token with SHA-256 (deterministic) for the DB query.
 * - Never logs the raw token.
 * - Marks the session as OPENED on first visit.
 * - Marks as EXPIRED if past expiresAt.
 * - Returns a discriminated union so callers can branch on the outcome.
 */
export async function lookupVerificationSession(
  rawToken: string
): Promise<SessionLookupResult> {
  // Deterministic hash — same token always produces the same hash.
  const tokenHash = hashToken(rawToken);

  const session = await db.verificationSession.findUnique({
    where: { tokenHash },
    include: {
      sale: {
        include: {
          directDebitMandate: {
            select: {
              bankName: true,
              sortCode: true,
              accountNumberLast4: true,
              accountHolderName: true,
              // encryptedAccountNumber intentionally excluded
            },
          },
        },
      },
    },
  });

  if (!session) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (session.status === "COMPLETED") {
    return { ok: false, reason: "COMPLETED" };
  }

  if (session.status === "DECLINED") {
    return { ok: false, reason: "DECLINED" };
  }

  // Treat any already-expired session as EXPIRED regardless of stored status.
  if (session.expiresAt < new Date()) {
    if (session.status !== "EXPIRED") {
      await db.verificationSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      });
    }
    return { ok: false, reason: "EXPIRED" };
  }

  // Mark first open — idempotent if already OPENED.
  let status = session.status;
  if (!session.openedAt) {
    await db.verificationSession.update({
      where: { id: session.id },
      data: { openedAt: new Date(), status: "OPENED" },
    });
    status = "OPENED";
  }

  const { sale } = session;
  const dd = sale.directDebitMandate;

  const data: SessionLookupData = {
    verification_session_id: session.id,
    sale_id: sale.id,
    status,
    expires_at: session.expiresAt,
    opened_at: session.openedAt ?? new Date(),

    customer: {
      full_name: sale.customerName,
      phone: sale.customerPhone ?? "",
      email: sale.customerEmail ?? null,
      address: sale.customerAddress ?? null,
      sales_channel: sale.salesChannel ?? null,
    },

    product: {
      name: sale.productName,
      subscription_price: sale.productPrice.toString(),
      subscription_frequency: sale.productFrequency ?? null,
      subscription_terms_summary: sale.productTerms ?? null,
      policies_summary: sale.productPolicies ?? null,
    },

    direct_debit: dd
      ? {
          bank_name: dd.bankName,
          sort_code: dd.sortCode,
          account_number_last4: dd.accountNumberLast4,
          account_holder_name: dd.accountHolderName,
        }
      : null,
    policy_snapshot: resolveSalePolicySnapshot({
      policySnapshot: sale.policySnapshot,
      productTerms: sale.productTerms,
      productPolicies: sale.productPolicies,
      coolingOffDays: sale.coolingOffDays,
    }),
    ai_marketing_opt_in: sale.aiMarketingOptIn ?? null,
    cooling_off_days: sale.coolingOffDays ?? null,
  };

  return { ok: true, data };
}
