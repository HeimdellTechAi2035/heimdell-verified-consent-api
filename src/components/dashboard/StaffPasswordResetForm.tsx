"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import {
  resetStaffPasswordAction,
  type StaffPasswordResetActionResult,
} from "@/app/dashboard/staff/actions";

export function StaffPasswordResetForm({
  targetUserId,
  targetName,
  targetEmail,
  canReset,
}: {
  targetUserId: string;
  targetName: string | null;
  targetEmail: string;
  targetRole: Role;
  canReset: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    StaffPasswordResetActionResult | null,
    FormData
  >(resetStaffPasswordAction, null);

  if (!canReset) {
    return <span className="text-xs text-gray-400">No action</span>;
  }

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Reset the password for ${targetName ?? targetEmail}? The temporary password will be shown once.`
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          {pending ? "Resetting..." : "Reset password"}
        </button>
      </form>

      {state?.ok === false && (
        <p className="max-w-xs rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.message}
        </p>
      )}

      {state?.ok && state.result.targetUserId === targetUserId && (
        <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Temporary password shown once</p>
          <p className="mt-1">
            Give this to {state.result.targetName ?? state.result.targetEmail} securely.
            They will be forced to change it when they next log in.
          </p>
          <code className="mt-2 block select-all rounded border border-amber-200 bg-white px-2 py-1 font-mono text-amber-950">
            {state.result.temporaryPassword}
          </code>
        </div>
      )}
    </div>
  );
}
