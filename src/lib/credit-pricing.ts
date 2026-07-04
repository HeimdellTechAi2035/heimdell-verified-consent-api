function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/// Credits charged for a link-based verification.
export const CREDIT_COST_LINK = envInt("CREDIT_COST_LINK", 1);

/// Credits charged for a phone-call verification.
export const CREDIT_COST_PHONE_CALL = envInt("CREDIT_COST_PHONE_CALL", 5);

export type CreditPack = {
  credits: number;
  priceGBP: number;
};

/// Preset credit packs offered on the "buy credits" page.
/// Not database-driven yet -- adjust here until per-client custom pricing is needed.
export const CREDIT_PACKS: readonly CreditPack[] = [
  { credits: 100, priceGBP: 20 },
  { credits: 500, priceGBP: 90 },
  { credits: 2000, priceGBP: 320 },
];

export type VerificationMethodForPricing = "link" | "phone_call";

export function creditCostForMethod(method: VerificationMethodForPricing): number {
  return method === "phone_call" ? CREDIT_COST_PHONE_CALL : CREDIT_COST_LINK;
}
