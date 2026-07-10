// DashboardShell - outer wrapper for all /dashboard/* pages.
// Composes dashboard navigation with the main content area and top app bar.

import { type ReactNode } from "react";
import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { getPwaAppKeyForRole } from "@/lib/pwa-identity";
import { CLIENT_OWNER_AND_PLATFORM_ROLES, isPlatformDashboardRole } from "@/lib/dashboard-role-policy";
import { getOrganizationCreditBalance } from "@/lib/dashboard-credits";
import { DashboardSidebar, DashboardTabletNav } from "./DashboardSidebar";

async function CreditBalanceBadge({ context }: { context: OrganizationContext }) {
  if (!(CLIENT_OWNER_AND_PLATFORM_ROLES as readonly string[]).includes(context.membership.role)) {
    return null;
  }

  let balance: number;
  try {
    balance = await getOrganizationCreditBalance(context.organization.id);
  } catch {
    // A transient DB error here must not crash the entire dashboard shell --
    // every /dashboard/* page renders through this component.
    return null;
  }

  return (
    <Link
      href="/dashboard/credits"
      className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 hover:bg-blue-100"
    >
      {balance} credits
    </Link>
  );
}

/// Deliberately no dismiss/close control -- this must keep showing on every
/// admin dashboard page load until the underlying Supabase plan actually has
/// automated backups, not just until someone closes it once. Platform-tier
/// roles only (see DISASTER_RECOVERY.md for the full detail).
function NoBackupWarningBanner() {
  return (
    <div className="bg-red-600 px-4 py-2.5 text-center text-xs font-semibold text-white sm:px-6 lg:px-8">
      ⚠️ No automated database backups are enabled (Supabase Free tier). If the database is lost
      right now, it cannot be restored. See DISASTER_RECOVERY.md.
    </div>
  );
}

export async function DashboardShell({
  children,
  context,
}: {
  children: ReactNode;
  context?: OrganizationContext;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <DashboardSidebar role={context?.membership.role} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6 lg:px-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">
              Heimdell Verified Consent
            </h1>
            <p className="text-xs text-gray-500">
              Compliance verification infrastructure
            </p>
            {context && (
              <p className="mt-1 truncate text-xs text-gray-400">
                {context.organization.name} · {context.membership.role}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {context && <CreditBalanceBadge context={context} />}
            <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Auth active
            </span>
            <a
              href="/logout"
              className="text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              Sign out
            </a>
          </div>
        </header>

        {context && isPlatformDashboardRole(context.membership.role) && (
          <NoBackupWarningBanner />
        )}

        <DashboardTabletNav role={context?.membership.role} />

        {context && <InstallPrompt appKey={getPwaAppKeyForRole(context.membership.role)} />}

        <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
        <LegalFooter className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8" />
      </div>
    </div>
  );
}
