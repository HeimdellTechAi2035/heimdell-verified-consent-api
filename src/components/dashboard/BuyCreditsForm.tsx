"use client";

import { useActionState } from "react";
import {
  createCreditCheckoutSessionAction,
  type BuyCreditsActionState,
} from "@/app/dashboard/credits/actions";
import type { CreditPack } from "@/lib/credit-pricing";

const initialState: BuyCreditsActionState = { status: "idle" };

export function BuyCreditsForm({ packs }: { packs: readonly CreditPack[] }) {
  const [state, formAction, isPending] = useActionState(
    createCreditCheckoutSessionAction,
    initialState
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-900">Buy credits</h3>
      <p className="mt-1 text-xs text-gray-500">
        Paid securely via Stripe. Credits are added as soon as payment completes.
      </p>

      {state.status === "error" && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {packs.map((pack, index) => (
          <form key={pack.credits} action={formAction}>
            <input type="hidden" name="packIndex" value={index} />
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-center hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
            >
              <p className="text-lg font-semibold text-gray-900">{pack.credits} credits</p>
              <p className="mt-1 text-sm text-gray-500">£{pack.priceGBP}</p>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
