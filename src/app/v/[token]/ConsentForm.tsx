"use client";

// Phase 4 — Interactive consent form (client component).
// Handles checkbox state, typed name, submission, loading, and success/error display.
// The server component (page.tsx) passes pre-fetched, safe session data as props.

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { LegalFooter } from "@/components/LegalFooter";
import type { SessionLookupData } from "@/types/hvcs";

// ---------------------------------------------------------------------------
// UI primitives — replicated here since this is a client component
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right">
        {value}
      </span>
    </div>
  );
}

function formatSortCode(sc: string): string {
  const digits = sc.replace(/\D/g, "");
  return digits.length === 6
    ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
    : sc;
}

const SALES_CHANNEL_LABELS: Record<string, string> = {
  door_to_door: "Door to door",
  phone:        "Phone",
  in_store:     "In store",
  online:       "Online",
  field_sales:  "Field sales",
  other:        "Other",
};

function formatSalesChannel(channel: string): string {
  return SALES_CHANNEL_LABELS[channel] ?? channel;
}

// ---------------------------------------------------------------------------
// Consent checkbox
// ---------------------------------------------------------------------------

function ConsentCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <span className="text-sm text-gray-700 leading-snug">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

function SuccessScreen({
  certificateId,
  completedAt,
}: {
  certificateId: string;
  completedAt: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 max-w-md w-full p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-5">
          <svg
            className="w-8 h-8 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Verification Complete
        </h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Thank you. Your consent has been securely recorded and a certificate
          has been generated.
        </p>

        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Certificate Reference
          </p>
          <p className="text-xs font-mono text-gray-700 break-all">
            {certificateId}
          </p>
          <p className="text-xs text-gray-400 pt-1">
            Verified:{" "}
            {new Date(completedAt).toLocaleString("en-GB", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </p>
        </div>

        <p className="text-xs text-gray-400">
          Please keep your certificate reference for your records. Contact us
          if you have any questions.
        </p>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main consent form
// ---------------------------------------------------------------------------

export function ConsentForm({ data }: { data: SessionLookupData }) {
  const params = useParams();
  const token = params.token as string;

  const { customer, product, direct_debit } = data;

  // Derived flags — computed once from props, used throughout.
  const aiConsentRequired = data.ai_marketing_opt_in !== null;

  // Consent checkbox state
  const [confirmDetails, setConfirmDetails] = useState(false);
  const [confirmPriceFreq, setConfirmPriceFreq] = useState(false);
  const [confirmTerms, setConfirmTerms] = useState(false);
  const [confirmPolicies, setConfirmPolicies] = useState(false);
  const [confirmCoolingOff, setConfirmCoolingOff] = useState(false);
  const [authoriseDD, setAuthoriseDD] = useState(false);
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const [confirmAiConsent, setConfirmAiConsent] = useState(false);

  // Typed name
  const [typedName, setTypedName] = useState("");

  // Submission state
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);
  const [completionData, setCompletionData] = useState<{
    certificate_id: string;
    completed_at: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Decline state
  const [showDeclinePanel, setShowDeclinePanel] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineDetails, setDeclineDetails] = useState("");
  const [isDeclinePending, startDeclineTransition] = useTransition();
  const [declined, setDeclined] = useState(false);
  const [declinedAt, setDeclinedAt] = useState<string | null>(null);
  const [declineErrorMessage, setDeclineErrorMessage] = useState<string | null>(null);

  const allChecked =
    confirmDetails &&
    confirmPriceFreq &&
    confirmTerms &&
    confirmPolicies &&
    confirmCoolingOff &&
    authoriseDD &&
    confirmEvidence &&
    (!aiConsentRequired || confirmAiConsent);

  const canSubmit = allChecked && typedName.trim().length >= 2 && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/verification-sessions/${token}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirm_details_correct: confirmDetails,
              confirm_product_price_frequency: confirmPriceFreq,
              confirm_terms: confirmTerms,
              confirm_policies: confirmPolicies,
              confirm_cooling_off: confirmCoolingOff,
              authorise_direct_debit: authoriseDD,
              confirm_evidence_storage: confirmEvidence,              confirm_ai_consent: aiConsentRequired ? confirmAiConsent : undefined,              typed_name: typedName.trim(),
            }),
          }
        );

        const json = await res.json();

        if (!res.ok || !json.ok) {
          const msg =
            json?.error?.message ??
            json?.error ??
            "Something went wrong. Please try again.";
          setErrorMessage(String(msg));
          return;
        }

        setCompletionData({
          certificate_id: json.certificate_id,
          completed_at: json.completed_at,
        });
        setCompleted(true);
      } catch {
        setErrorMessage(
          "A network error occurred. Please check your connection and try again."
        );
      }
    });
  };

  const handleDecline = () => {
    if (declineReason.trim().length < 3 || isDeclinePending) return;
    setDeclineErrorMessage(null);

    startDeclineTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/verification-sessions/${token}/decline`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reason: declineReason.trim(),
              details: declineDetails.trim() || undefined,
            }),
          }
        );

        const json = await res.json();

        if (!res.ok || !json.ok) {
          const msg =
            json?.error?.message ??
            json?.error ??
            "Something went wrong. Please try again.";
          setDeclineErrorMessage(String(msg));
          return;
        }

        setDeclinedAt(json.declined_at);
        setDeclined(true);
      } catch {
        setDeclineErrorMessage(
          "A network error occurred. Please check your connection and try again."
        );
      }
    });
  };

  // ------------------------------------------------------------------
  // Declined state — replace entire page
  // ------------------------------------------------------------------
  if (declined) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <main className="flex flex-1 items-center justify-center py-10 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 mb-4">
            <svg
              className="w-7 h-7 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Verification Declined
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your decline has been recorded. If this was unexpected or you changed
            your mind, please contact the provider directly.
          </p>
          {declinedAt && (
            <p className="mt-4 text-xs text-gray-400">
              Recorded at{" "}
              {new Date(declinedAt).toLocaleString("en-GB", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
          )}
          <p className="mt-3 text-xs text-gray-400">
            Ref: {data.verification_session_id}
          </p>
          </div>
        </main>
        <LegalFooter />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Success state — replace entire page
  // ------------------------------------------------------------------
  if (completed && completionData) {
    return (
      <SuccessScreen
        certificateId={completionData.certificate_id}
        completedAt={completionData.completed_at}
      />
    );
  }

  // ------------------------------------------------------------------
  // Verification form
  // ------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 py-10 px-4">
        <div className="max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Secure Verification
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Please review all details carefully, then tick each confirmation and
            type your full name to proceed.
          </p>
          <p className="mt-2 text-xs text-gray-400 font-mono">
            Ref: {data.verification_session_id}
          </p>
        </div>

        {/* Customer Details */}
        <Section title="Your Details">
          <Row label="Full Name" value={customer.full_name} />
          <Row label="Phone" value={customer.phone} />
          {customer.email && <Row label="Email" value={customer.email} />}
          {customer.address && <Row label="Address" value={customer.address} />}
          {customer.sales_channel && (
            <Row label="Signed up via" value={formatSalesChannel(customer.sales_channel)} />
          )}
          {data.ai_marketing_opt_in !== null && (
            <Row
              label="AI communications"
              value={data.ai_marketing_opt_in ? "Opted in" : "Opted out"}
            />
          )}
        </Section>

        {/* Product */}
        <Section title="What You Are Agreeing To">
          <Row label="Product" value={product.name} />
          <Row
            label="Price"
            value={`£${product.subscription_price}${
              product.subscription_frequency
                ? ` / ${product.subscription_frequency}`
                : ""
            }`}
          />
          {product.subscription_terms_summary && (
            <div className="pt-3 mt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Terms Summary
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {product.subscription_terms_summary}
              </p>
            </div>
          )}
        </Section>

        {/* Policies */}
        {product.policies_summary && (
          <Section title="Important Policies">
            <p className="text-sm text-gray-700 leading-relaxed">
              {product.policies_summary}
            </p>
          </Section>
        )}

        {/* Direct Debit */}
        {direct_debit && (
          <Section title="Direct Debit Details">
            <Row label="Bank" value={direct_debit.bank_name} />
            <Row
              label="Sort Code"
              value={formatSortCode(direct_debit.sort_code)}
            />
            <Row
              label="Account Number"
              value={`****${direct_debit.account_number_last4}`}
            />
            <Row
              label="Account Holder"
              value={direct_debit.account_holder_name}
            />
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Only the last 4 digits of your account number are shown for
                security.
              </p>
            </div>
          </Section>
        )}

        {/* Consent confirmations */}
        <Section title="Your Consent">
          <div className="space-y-4">
            <ConsentCheckbox
              id="confirm_details"
              label={`I confirm that my personal details shown above are correct.`}
              checked={confirmDetails}
              onChange={setConfirmDetails}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="confirm_price_freq"
              label={`I confirm I have agreed to the ${product.name} at £${product.subscription_price}${product.subscription_frequency ? ` per ${product.subscription_frequency}` : ""} as described above.`}
              checked={confirmPriceFreq}
              onChange={setConfirmPriceFreq}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="confirm_terms"
              label="I have read and agree to the subscription terms and conditions."
              checked={confirmTerms}
              onChange={setConfirmTerms}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="confirm_policies"
              label="I have read and understood the policies, including any cancellation rights."
              checked={confirmPolicies}
              onChange={setConfirmPolicies}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="confirm_cooling_off"
              label={
                data.cooling_off_days
                  ? `I understand I have a ${data.cooling_off_days}-day cooling-off period during which I can cancel without penalty.`
                  : "I understand I may have a cooling-off period during which I can cancel without penalty."
              }
              checked={confirmCoolingOff}
              onChange={setConfirmCoolingOff}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="authorise_dd"
              label="I authorise the Direct Debit as detailed above, subject to the Direct Debit Guarantee. I am the account holder and the sole signatory required."
              checked={authoriseDD}
              onChange={setAuthoriseDD}
              disabled={isPending}
            />
            <ConsentCheckbox
              id="confirm_evidence"
              label="I consent to this verification being recorded and stored as evidence of my authorisation."
              checked={confirmEvidence}
              onChange={setConfirmEvidence}
              disabled={isPending}
            />
            {aiConsentRequired && (
              <ConsentCheckbox
                id="confirm_ai_consent"
                label={
                  data.ai_marketing_opt_in
                    ? "I confirm I have opted in to AI-assisted communications and automated processing from this provider."
                    : "I confirm I have opted out of AI-assisted communications and automated marketing from this provider."
                }
                checked={confirmAiConsent}
                onChange={setConfirmAiConsent}
                disabled={isPending}
              />
            )}
          </div>

          {/* Typed name */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <label
              htmlFor="typed_name"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Type your full name to confirm
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Please type exactly:{" "}
              <span className="font-medium text-gray-600">
                {customer.full_name}
              </span>
            </p>
            <input
              id="typed_name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              disabled={isPending}
              placeholder={customer.full_name}
              autoComplete="name"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>

          {/* Error banner */}
          {errorMessage && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* Submit */}
          <div className="mt-5">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full font-semibold py-3 px-4 rounded-xl text-sm transition-opacity ${
                canSubmit
                  ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                  : "bg-blue-600 text-white opacity-40 cursor-not-allowed"
              }`}
            >
              {isPending ? "Submitting…" : "Confirm and Authorise"}
            </button>
            {!allChecked && (
              <p className="mt-2 text-xs text-center text-gray-400">
                Please tick all confirmation boxes above to continue.
              </p>
            )}
            {allChecked && typedName.trim().length < 2 && (
              <p className="mt-2 text-xs text-center text-gray-400">
                Please type your full name to continue.
              </p>
            )}
          </div>
        </Section>

        {/* Footer */}
        <div className="pb-6 text-center">
          <p className="text-xs text-gray-400">
            This is a secure, encrypted verification page. Your information is
            protected.
          </p>
        </div>

        {/* Decline section */}
        {!showDeclinePanel ? (
          <div className="pb-2 text-center">
            <button
              onClick={() => setShowDeclinePanel(true)}
              disabled={isPending}
              className="text-sm text-gray-400 underline underline-offset-2 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              Details are incorrect / I do not agree
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
            <h2 className="text-sm font-semibold text-red-700 mb-1">
              Decline Verification
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              If the details shown are incorrect or you do not agree to proceed,
              you may decline. This will be recorded.
            </p>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="decline_reason"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Reason <span className="text-red-500">*</span>
                </label>
                <select
                  id="decline_reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  disabled={isDeclinePending}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-60"
                >
                  <option value="">Select a reason…</option>
                  <option value="The details shown are incorrect">
                    The details shown are incorrect
                  </option>
                  <option value="I was not told about these terms">
                    I was not told about these terms
                  </option>
                  <option value="The price is not what I agreed">
                    The price is not what I agreed
                  </option>
                  <option value="I do not authorise this direct debit">
                    I do not authorise this direct debit
                  </option>
                  <option value="I have changed my mind">
                    I have changed my mind
                  </option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="decline_details"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Additional details{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="decline_details"
                  rows={3}
                  value={declineDetails}
                  onChange={(e) => setDeclineDetails(e.target.value)}
                  disabled={isDeclinePending}
                  maxLength={1000}
                  placeholder="Please describe any specific issues…"
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-60 resize-none"
                />
                <p className="mt-1 text-xs text-gray-400 text-right">
                  {declineDetails.length}/1000
                </p>
              </div>
            </div>

            {declineErrorMessage && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{declineErrorMessage}</p>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setShowDeclinePanel(false);
                  setDeclineErrorMessage(null);
                }}
                disabled={isDeclinePending}
                className="flex-1 font-medium py-2.5 px-4 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={declineReason.trim().length < 3 || isDeclinePending}
                className={`flex-1 font-semibold py-2.5 px-4 rounded-xl text-sm transition-opacity ${
                  declineReason.trim().length >= 3 && !isDeclinePending
                    ? "bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                    : "bg-red-600 text-white opacity-40 cursor-not-allowed"
                }`}
              >
                {isDeclinePending ? "Submitting…" : "Confirm Decline"}
              </button>
            </div>
          </div>
        )}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
