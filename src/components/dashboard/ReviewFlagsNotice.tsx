// Banner shown on a sale's detail page when the phone verification agent
// flagged a customer-reported correction (see voice-agent-service/src/corrections.ts).

import type { ReviewFlagEntry } from "@/lib/dashboard-sales";

const REVIEW_FIELD_LABELS: Record<string, string> = {
  customerName: "Customer name",
  customerAddress: "Customer address",
  customerEmail: "Customer email",
  productName: "Product name",
  productFrequency: "Billing frequency",
  productPrice: "Price",
  bankName: "Bank name",
  sortCode: "Sort code",
  accountNumberLast4: "Account number",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ReviewFlagsNotice({ flags }: { flags: ReviewFlagEntry[] }) {
  if (flags.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <p className="font-semibold">
        Needs review -- the customer reported details as wrong during the phone verification call.
      </p>
      <ul className="mt-3 space-y-2">
        {flags.map((flag, i) => (
          <li key={i} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
            <p>
              <span className="font-semibold">{REVIEW_FIELD_LABELS[flag.field] ?? flag.field}</span>{" "}
              {flag.applied ? "was updated" : "was reported wrong (not auto-updated -- needs manual follow-up)"}:{" "}
              on file was <span className="font-mono">{flag.oldValue || "(blank)"}</span>, customer said{" "}
              <span className="font-mono">{flag.newValue || "(blank)"}</span>.
            </p>
            <p className="mt-1 text-xs text-amber-700">{formatDateTime(flag.correctedAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
