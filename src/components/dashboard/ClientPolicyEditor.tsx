"use client";

import { useActionState, useMemo, useState } from "react";
import { saveClientPolicyAction } from "@/app/dashboard/settings/actions";
import type {
  ClientPolicyViewModel,
  PolicySettingsActionState,
} from "@/lib/client-policy";

const INITIAL_STATE: PolicySettingsActionState = {
  status: "idle",
  message: null,
};

function TextAreaField({
  label,
  name,
  defaultValue,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <textarea
        className="mt-1 min-h-28 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        required
      />
    </label>
  );
}

export function ClientPolicyEditor({
  policies,
  canManage,
}: {
  policies: ClientPolicyViewModel[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveClientPolicyAction,
    INITIAL_STATE
  );
  const [selectedClientId, setSelectedClientId] = useState(
    policies[0]?.clientId ?? ""
  );
  const selectedPolicy = useMemo(
    () =>
      policies.find((policy) => policy.clientId === selectedClientId) ??
      policies[0],
    [policies, selectedClientId]
  );

  if (!selectedPolicy) {
    return (
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">
          Compliance policy
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          No active client is available for this organization yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Compliance policy
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            This wording is shown to customers during verification. Each new
            verification captures an immutable snapshot, so later edits do not
            change old evidence.
          </p>
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
          {canManage ? "Client policy management" : "Read-only"}
        </span>
      </div>

      {state.message && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            state.status === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <form key={selectedPolicy.clientId} action={action} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Client
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-400"
              name="clientId"
              onChange={(event) => setSelectedClientId(event.target.value)}
              value={selectedPolicy.clientId}
            >
              {policies.map((policy) => (
                <option key={policy.clientId} value={policy.clientId}>
                  {policy.clientName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Policy Version
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              defaultValue={selectedPolicy.policyVersion}
              disabled={!canManage}
              maxLength={40}
              name="policyVersion"
              required
            />
            <span className="mt-1 block text-xs text-gray-400">
              Last updated:{" "}
              {selectedPolicy.updatedAt
                ? new Date(selectedPolicy.updatedAt).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "Defaults in use"}
            </span>
          </label>
        </div>

        <TextAreaField
          defaultValue={selectedPolicy.termsAndConditions}
          disabled={!canManage}
          label="Terms and Conditions"
          name="termsAndConditions"
        />
        <TextAreaField
          defaultValue={selectedPolicy.coolingOffPolicy}
          disabled={!canManage}
          label="Cooling-off Policy"
          name="coolingOffPolicy"
        />
        <TextAreaField
          defaultValue={selectedPolicy.cancellationInstructions}
          disabled={!canManage}
          label="Cancellation Instructions"
          name="cancellationInstructions"
        />
        <TextAreaField
          defaultValue={selectedPolicy.privacyEvidenceWording}
          disabled={!canManage}
          label="Privacy and Evidence Storage Wording"
          name="privacyEvidenceWording"
        />
        <TextAreaField
          defaultValue={selectedPolicy.directDebitGuaranteeWording}
          disabled={!canManage}
          label="Direct Debit Guarantee Wording"
          name="directDebitGuaranteeWording"
        />

        <div className="flex justify-end border-t border-gray-100 pt-5">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Saving..." : "Save policy"}
          </button>
        </div>
      </form>
    </div>
  );
}
