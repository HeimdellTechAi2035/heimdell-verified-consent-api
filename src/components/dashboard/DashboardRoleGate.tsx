import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getDashboardRoleAccessState } from "@/lib/dashboard-auth";
import {
  getAllowedDashboardRoles,
  type DashboardSection,
} from "@/lib/dashboard-role-policy";
import { prepareDashboardPageAccessAuditEvent } from "@/lib/dashboard-audit";

function AccessBlockedPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-[45vh] flex items-center justify-center">
      <div className="max-w-lg w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-6 w-6 text-red-500"
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

export async function DashboardRoleGate({
  children,
  section,
}: {
  children: ReactNode;
  section: DashboardSection;
}) {
  const allowedRoles = getAllowedDashboardRoles(section);
  const state = await getDashboardRoleAccessState(allowedRoles);

  if (state.status === "unauthenticated") {
    redirect("/login");
  }

  if (state.status === "missing_user_mapping") {
    return (
      <AccessBlockedPanel
        title="Dashboard user not configured"
        message="Your Supabase session is valid, but no internal Heimdell user record is mapped to this identity yet."
      />
    );
  }

  if (state.status === "missing_membership") {
    return (
      <AccessBlockedPanel
        title="No organization access configured"
        message="Your dashboard user exists, but it is not a member of any Heimdell organization yet."
      />
    );
  }

  if (state.status === "insufficient_role") {
    prepareDashboardPageAccessAuditEvent({
      section,
      outcome: "denied",
      organizationId: state.context.organization.id,
      userId: state.context.user.id,
      role: state.context.membership.role,
    });

    return (
      <AccessBlockedPanel
        title="Access denied"
        message="Your current organization role does not allow access to this dashboard section."
      />
    );
  }

  prepareDashboardPageAccessAuditEvent({
    section,
    outcome: "allowed",
    organizationId: state.context.organization.id,
    userId: state.context.user.id,
    role: state.context.membership.role,
  });

  return <>{children}</>;
}
