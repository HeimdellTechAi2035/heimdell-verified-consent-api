// DashboardShell — outer wrapper for all /dashboard/* pages.
// Composes DashboardSidebar with the main content area and top app bar.

import { type ReactNode } from "react";
import { LegalFooter } from "@/components/LegalFooter";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardShell({
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
        {/* App bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Heimdell Verified Consent
            </h1>
            <p className="text-xs text-gray-500">Compliance verification infrastructure</p>
            {context && (
              <p className="mt-1 text-xs text-gray-400">
                {context.organization.name} · {context.membership.role}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
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

        {/* Page content */}
        <main className="flex-1 overflow-auto px-8 py-6">
          {children}
        </main>
        <LegalFooter className="shrink-0 border-t border-gray-200 bg-white px-8 py-3" />
      </div>
    </div>
  );
}
