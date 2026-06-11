import { type ReactNode } from "react";
import type { DashboardAccessState } from "@/lib/dashboard-auth";

function BlockedState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-[55vh] flex items-center justify-center">
      <div className="max-w-lg w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <svg
            className="h-6 w-6 text-amber-500"
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
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export function DashboardAccessGate({
  children,
  state,
}: {
  children: ReactNode;
  state: DashboardAccessState;
}) {
  if (state.status === "missing_user_mapping") {
    return (
      <BlockedState
        title="Dashboard user not configured"
        message="Your Supabase session is valid, but no internal Heimdell user record is mapped to this identity yet. Ask an administrator to create or link your dashboard user."
      />
    );
  }

  if (state.status === "missing_membership") {
    return (
      <BlockedState
        title="No organization access configured"
        message="Your dashboard user exists, but it is not a member of any Heimdell organization yet. Ask an administrator to assign organization access before the dashboard can be used."
      />
    );
  }

  return <>{children}</>;
}
