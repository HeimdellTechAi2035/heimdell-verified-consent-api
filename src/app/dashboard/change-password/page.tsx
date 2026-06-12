import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getDashboardAccessState } from "@/lib/dashboard-auth";
import { changeTemporaryPassword } from "./actions";

export const metadata: Metadata = {
  title: "Change Password - Heimdell",
};

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "missing-current-password": "Enter the current temporary password.",
  "weak-password": "Choose a new password with at least 12 characters.",
  "current-password-invalid": "The current temporary password was not accepted.",
  "password-update-failed": "Supabase could not update the password. Try a stronger password.",
};

function BlockedState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
        {message}
      </p>
    </div>
  );
}

export default async function ChangePasswordPage({ searchParams }: Props) {
  const state = await getDashboardAccessState();

  if (state.status === "unauthenticated") {
    redirect("/login");
  }

  if (state.status === "missing_user_mapping") {
    return (
      <BlockedState
        title="Dashboard user not configured"
        message="Your login session is valid, but no Heimdell dashboard user is linked to this identity yet."
      />
    );
  }

  if (state.status === "missing_membership") {
    return (
      <BlockedState
        title="No organization access configured"
        message="Your dashboard user exists, but it has not been assigned to an organization yet."
      />
    );
  }

  if (state.status !== "authenticated") {
    return (
      <BlockedState
        title="Dashboard access unavailable"
        message="Your session is active, but this page cannot confirm dashboard access right now. Sign out and sign in again if the problem continues."
      />
    );
  }

  if (state.status === "authenticated" && !state.context.user.mustChangePassword) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <div className="max-w-xl">
      <DashboardHeader
        title="Change temporary password"
        subtitle="Create a permanent password before continuing to the dashboard."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Password change required
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            This account was provisioned by a Heimdell platform admin. Enter
            the temporary password and choose a new password to unlock normal
            dashboard access.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <form action={changeTemporaryPassword} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Current temporary password
            </span>
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              New password
            </span>
            <input
              name="newPassword"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
