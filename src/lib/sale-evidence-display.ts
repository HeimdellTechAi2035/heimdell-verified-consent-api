const CONTRACT_LENGTH_PREFIX = /^Contract length:\s*(.+?)(?:\r?\n\r?\n|\r?\n|$)([\s\S]*)$/i;

const CONSENT_EVENT_LABELS: Record<string, string> = {
  TERMS_ACKNOWLEDGED: "Terms acknowledged",
  POLICIES_ACKNOWLEDGED: "Policies acknowledged",
  COOLING_OFF_ACKNOWLEDGED: "Cooling-off rights acknowledged",
  DIRECT_DEBIT_AUTHORISED: "Direct Debit authorised",
  VERIFICATION_COMPLETED: "Verification completed",
  VERIFICATION_DECLINED: "Verification declined",
  SESSION_OPENED: "Session opened",
  PAGE_VIEWED: "Page viewed",
  TERMS_ACCEPTED: "Terms accepted",
  PRODUCT_CONFIRMED: "Product confirmed",
  DIRECT_DEBIT_CONFIRMED: "Direct Debit confirmed",
};

export type NormalizedSaleTermsEvidence = {
  contractLength: string | null;
  termsSummary: string | null;
};

function normalizeEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeDuplicatedContractLengthPrefix(
  termsSummary: string | null,
  contractLength: string | null
): string | null {
  if (!termsSummary || !contractLength) {
    return termsSummary;
  }

  const escapedContract = escapeRegExp(contractLength).replace(/\s+/g, "\\s+");
  const duplicatePrefix = new RegExp(
    `^\\s*${escapedContract}(?:\\s*[-:–—]+\\s*|\\s+)?`,
    "i"
  );
  const cleaned = termsSummary.replace(duplicatePrefix, "").trim();

  return cleaned && cleaned !== termsSummary ? cleaned : termsSummary;
}

export function normalizeSaleTermsForEvidence(
  productTerms: string | null | undefined
): NormalizedSaleTermsEvidence {
  const normalizedTerms = normalizeEmpty(productTerms);

  if (!normalizedTerms) {
    return {
      contractLength: null,
      termsSummary: null,
    };
  }

  const match = normalizedTerms.match(CONTRACT_LENGTH_PREFIX);
  if (!match) {
    return {
      contractLength: null,
      termsSummary: normalizedTerms,
    };
  }

  const contractLength = normalizeEmpty(match[1]);
  const rawTermsSummary = normalizeEmpty(match[2]);
  const termsSummary = removeDuplicatedContractLengthPrefix(
    rawTermsSummary,
    contractLength
  );

  return {
    contractLength,
    termsSummary,
  };
}

export function humanizeConsentEventType(eventType: string): string {
  const known = CONSENT_EVENT_LABELS[eventType];
  if (known) {
    return known;
  }

  return eventType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
