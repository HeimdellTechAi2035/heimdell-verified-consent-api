"use client";

import { useActionState } from "react";
import {
  approveSignupAction,
  type ApproveSignupActionResult,
} from "@/app/dashboard/signups/actions";

export function SignupApprovalForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [state, formAction, pending] = useActionState<
    ApproveSignupActionResult | null,
    FormData
  >(approveSignupAction, null);

  const alreadyHandled = state?.ok && state.result.organizationId === organizationId;

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Approve ${organizationName}? This creates their dashboard login and emails it to them.`
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <button
          type="submit"
          disabled={pending || Boolean(alreadyHandled)}
          className="text-xs font-semibold text-green-700 hover:text-green-800 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          {pending ? "Approving..." : "Approve"}
        </button>
      </form>

      {state?.ok === false && (
        <p className="max-w-xs rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.message}
        </p>
      )}

      {alreadyHandled && state.ok && (
        <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">
            {state.result.emailSent
              ? "Approved — login emailed to the applicant."
              : "Approved — email could not be sent. Relay this manually:"}
          </p>
          {!state.result.emailSent && (
            <>
              <p className="mt-2">Temporary password (shown once):</p>
              <code className="mt-1 block select-all rounded border border-amber-200 bg-white px-2 py-1 font-mono text-amber-950">
                {state.result.temporaryPassword}
              </code>
              <p className="mt-2">
                Login URL:{" "}
                <a href={state.result.loginUrl} className="font-semibold text-blue-700 underline">
                  {state.result.loginUrl}
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
