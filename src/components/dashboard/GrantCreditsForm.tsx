"use client";

import { useActionState } from "react";
import {
  grantCreditsAction,
  type GrantCreditsActionResult,
} from "@/app/dashboard/clients/[organizationId]/actions";

export function GrantCreditsForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState<
    GrantCreditsActionResult | null,
    FormData
  >(grantCreditsAction, null);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Credits</span>
          <input
            className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            inputMode="numeric"
            min={1}
            name="amount"
            required
            type="number"
          />
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="text-xs font-medium text-gray-700">Reason</span>
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            name="reason"
            placeholder="e.g. manual test grant, goodwill credit"
            required
            type="text"
          />
        </label>
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          disabled={pending}
          type="submit"
        >
          {pending ? "Granting..." : "Grant credits"}
        </button>
      </form>

      {state?.ok === false && (
        <p className="max-w-md rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.message}
        </p>
      )}

      {state?.ok && (
        <p className="max-w-md rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">
          Granted {state.amount} credits.
        </p>
      )}
    </div>
  );
}
