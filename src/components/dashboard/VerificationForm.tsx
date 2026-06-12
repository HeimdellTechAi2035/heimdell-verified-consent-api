"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type {
  DashboardNewVerificationState,
  DashboardSellerOption,
} from "@/lib/dashboard-new-verification";

type VerificationFormMode = "seller" | "manager";

type VerificationFormProps = {
  action: (
    previousState: DashboardNewVerificationState,
    formData: FormData
  ) => Promise<DashboardNewVerificationState>;
  mode: VerificationFormMode;
  sellers?: DashboardSellerOption[];
  backHref: string;
  backLabel: string;
};

const INITIAL_STATE: DashboardNewVerificationState = {
  status: "idle",
  message: null,
  createdVerification: null,
};

const SALES_CHANNELS = [
  { value: "door_to_door", label: "Door to door" },
  { value: "phone", label: "Phone" },
  { value: "in_store", label: "In store" },
  { value: "online", label: "Online" },
  { value: "field_sales", label: "Field sales" },
  { value: "other", label: "Other" },
];

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
  inputMode,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  inputMode?: "decimal" | "numeric" | "tel";
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        defaultValue={defaultValue}
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <textarea
        className="mt-1 min-h-28 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        name={name}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  children,
  required = false,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <select
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        name={name}
        required={required}
      >
        {children}
      </select>
    </label>
  );
}

function SuccessPanel({
  state,
  backHref,
  backLabel,
}: {
  state: Extract<DashboardNewVerificationState, { status: "success" }>;
  backHref: string;
  backLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const verification = state.createdVerification;

  async function copyLink() {
    await navigator.clipboard.writeText(verification.verificationUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl rounded-xl border border-green-200 bg-white p-6 shadow-sm">
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm font-semibold text-green-900">
          Verification created
        </p>
        <p className="mt-1 text-xs text-green-800">
          Status Pending. Share the secure link with the customer now; the raw
          secure link is only shown on this success screen.
        </p>
      </div>

      <dl className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Customer
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {verification.customerName}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Product
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {verification.productName}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Sale ID
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-gray-700">
            {verification.saleId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Session ID
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-gray-700">
            {verification.verificationSessionId}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Status
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {verification.status}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Expires
          </dt>
          <dd className="mt-1 text-sm text-gray-700">
            {new Date(verification.expiresAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            Verification link
          </span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-900"
            readOnly
            value={verification.verificationUrl}
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={copyLink}
          type="button"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <Link
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
          href={backHref}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

export function VerificationForm({
  action,
  mode,
  sellers = [],
  backHref,
  backLabel,
}: VerificationFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  if (state.status === "success") {
    return (
      <SuccessPanel backHref={backHref} backLabel={backLabel} state={state} />
    );
  }

  return (
    <form action={formAction} className="max-w-4xl space-y-5">
      {state.status === "error" && state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      )}

      {mode === "manager" && (
        <FormSection title="Seller assignment">
          <SelectField label="Assign seller" name="sellerUserId">
            <option value="">No seller assigned</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name ? `${seller.name} (${seller.email})` : seller.email}
              </option>
            ))}
          </SelectField>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
            Only sellers from your organization can be assigned. The server
            validates this again before creating the verification.
          </div>
        </FormSection>
      )}

      <FormSection title="Customer">
        <Field label="Full name" name="customerFullName" required />
        <Field
          inputMode="tel"
          label="Phone"
          name="customerPhone"
          required
        />
        <Field label="Email" name="customerEmail" type="email" />
        <Field label="Address" name="customerAddress" required />
      </FormSection>

      <FormSection title="Product">
        <Field label="Product name" name="productName" required />
        <Field
          inputMode="decimal"
          label="Subscription price"
          name="subscriptionPrice"
          placeholder="49.99"
          required
          step="0.01"
          type="number"
        />
        <Field
          label="Subscription frequency"
          name="subscriptionFrequency"
          placeholder="monthly"
          required
        />
        <Field
          label="Contract length"
          name="contractLength"
          placeholder="12 months"
        />
        <SelectField label="Sales channel" name="salesChannel" required>
          {SALES_CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>
              {channel.label}
            </option>
          ))}
        </SelectField>
        <TextArea
          label="Subscription terms summary"
          name="subscriptionTermsSummary"
          required
        />
        <TextArea label="Policies summary" name="policiesSummary" required />
      </FormSection>

      <FormSection title="Payment">
        <Field label="Bank name" name="bankName" required />
        <Field
          inputMode="numeric"
          label="Sort code"
          name="sortCode"
          placeholder="12-34-56"
          required
        />
        <Field
          inputMode="numeric"
          label="Account number"
          name="accountNumber"
          required
        />
        <Field
          label="Account holder name"
          name="accountHolderName"
          required
        />
      </FormSection>

      <FormSection title="Consent">
        <Field
          defaultValue="14"
          inputMode="numeric"
          label="Cooling-off days"
          name="coolingOffDays"
          required
          type="number"
        />
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            name="aiMarketingOptIn"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700">
              AI marketing opt in
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-gray-500">
              Leave unticked unless the customer has explicitly opted in.
            </span>
          </span>
        </label>
      </FormSection>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
          href={backHref}
        >
          Cancel
        </Link>
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          disabled={pending}
          type="submit"
        >
          {pending ? "Sending..." : "Send Verification"}
        </button>
      </div>
    </form>
  );
}
