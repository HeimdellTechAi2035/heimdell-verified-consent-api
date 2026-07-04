import type { Prisma } from "@prisma/client";

/// Thrown when an Organization's credit balance can't cover a charge.
/// Thrown from inside a $transaction callback -- the transaction aborts
/// automatically, so no Sale/ledger row is ever created alongside it.
export class InsufficientCreditsError extends Error {
  constructor(public readonly organizationId: string, public readonly required: number) {
    super(`Organization ${organizationId} has insufficient credits (needs ${required}).`);
    this.name = "InsufficientCreditsError";
  }
}

type TxClient = Prisma.TransactionClient;

/**
 * Atomically deducts `cost` credits for a verification, race-safe under
 * concurrent charges via a conditional `updateMany` (not a separate
 * read-then-write, which would race). Throws InsufficientCreditsError if the
 * balance can't cover it -- callers running inside their own $transaction
 * should let this propagate so the whole transaction rolls back.
 */
export async function chargeCreditsForVerification(
  tx: TxClient,
  params: {
    organizationId: string;
    cost: number;
    saleId: string;
    verificationSessionId: string;
  }
): Promise<void> {
  const { organizationId, cost, saleId, verificationSessionId } = params;

  const deducted = await tx.creditBalance.updateMany({
    where: { organizationId, balance: { gte: cost } },
    data: { balance: { decrement: cost } },
  });

  if (deducted.count !== 1) {
    throw new InsufficientCreditsError(organizationId, cost);
  }

  const balance = await tx.creditBalance.findUniqueOrThrow({
    where: { organizationId },
    select: { balance: true },
  });

  await tx.creditLedgerEntry.create({
    data: {
      organizationId,
      type: "VERIFICATION_CHARGE",
      amount: -cost,
      balanceAfter: balance.balance,
      relatedSaleId: saleId,
      relatedVerificationSessionId: verificationSessionId,
    },
  });
}

/**
 * Credits an Organization's balance (purchase, refund, or manual
 * adjustment). Unconditional -- always succeeds, creates the CreditBalance
 * row lazily if this is the org's first credit event.
 */
export async function creditOrganizationBalance(
  tx: TxClient,
  params: {
    organizationId: string;
    amount: number;
    type: "PURCHASE" | "REFUND" | "ADJUSTMENT";
    relatedStripePaymentIntentId?: string;
    description?: string;
  }
): Promise<void> {
  const { organizationId, amount, type, relatedStripePaymentIntentId, description } = params;

  const updated = await tx.creditBalance.upsert({
    where: { organizationId },
    create: { organizationId, balance: amount },
    update: { balance: { increment: amount } },
  });

  await tx.creditLedgerEntry.create({
    data: {
      organizationId,
      type,
      amount,
      balanceAfter: updated.balance,
      relatedStripePaymentIntentId,
      description,
    },
  });
}
