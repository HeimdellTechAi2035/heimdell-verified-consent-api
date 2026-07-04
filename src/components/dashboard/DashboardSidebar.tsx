"use client";

// DashboardSidebar — navigation sidebar for all /dashboard/* pages.
// Uses usePathname() to highlight the currently active nav item.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import type { Role } from "@prisma/client";
import {
  roleCanAccessDashboardSection,
  type DashboardSection,
} from "@/lib/dashboard-role-policy";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  section: DashboardSection;
};
type NavSection = { heading?: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        href: "/dashboard/overview",
        label: "Overview",
        section: "overview",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: "Records",
    items: [
      {
        href: "/dashboard/clients",
        label: "Clients",
        section: "clients",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm6 4a2 2 0 100-4 2 2 0 000 4zM3 14a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/clients/new",
        label: "New Client",
        section: "clients",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m8-8H4" />
          </svg>
        ),
      },
      {
        href: "/dashboard/my-sales",
        label: "My Sales",
        section: "my-sales",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17v-6a2 2 0 012-2h8m0 0l-3-3m3 3l-3 3M5 7h4m-4 4h4m-4 4h4" />
          </svg>
        ),
      },
      {
        href: "/dashboard/sales",
        label: "Sales",
        section: "sales",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
      },
      {
        href: "/dashboard/verifications",
        label: "Verifications",
        section: "verifications",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/certificates",
        label: "Certificates",
        section: "certificates",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/staff",
        label: "Staff",
        section: "staff",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 14c3.314 0 6 1.79 6 4v1H6v-1c0-2.21 2.686-4 6-4zm0-2a4 4 0 100-8 4 4 0 000 8zm6-1a3 3 0 100-6m0 8c2.21 0 4 1.194 4 2.667V17h-3" />
          </svg>
        ),
      },
      {
        href: "/dashboard/notifications",
        label: "Notifications",
        section: "notifications",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: "Developer",
    items: [
      {
        href: "/dashboard/webhooks",
        label: "Webhooks",
        section: "webhooks",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        ),
      },
      {
        href: "/dashboard/api-keys",
        label: "API Keys",
        section: "api-keys",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/integrations",
        label: "Integrations",
        section: "integrations",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
          </svg>
        ),
      },
    ],
  },
  {
    items: [
      {
        href: "/dashboard/credits",
        label: "Credits",
        section: "credits",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6V6m0 1.5V15m0 1.5V15m-7-3a7 7 0 1114 0 7 7 0 01-14 0z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        section: "settings",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

export function DashboardSidebar({ role }: { role?: Role }) {
  const pathname = usePathname();
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      role ? roleCanAccessDashboardSection(role, item.section) : false
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="hidden w-60 shrink-0 bg-gray-900 lg:flex lg:flex-col">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-gray-800">
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase mb-0.5">
          Heimdell
        </p>
        <p className="text-sm font-semibold text-white leading-snug">
          Verified Consent
        </p>
        <p className="text-xs text-gray-500 mt-0.5">Compliance infrastructure</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {visibleSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-5" : ""}>
            {section.heading && (
              <p className="px-3 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-widest">
                {section.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                      isActive
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    <span
                      className={`shrink-0 transition-colors ${
                        isActive
                          ? "text-blue-400"
                          : "text-gray-500 group-hover:text-blue-400"
                      }`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">Secure dashboard</p>
        <p className="text-xs text-gray-700 mt-0.5">Role-gated tenant access</p>
      </div>
    </aside>
  );
}

export function DashboardTabletNav({ role }: { role?: Role }) {
  const pathname = usePathname();
  const visibleItems = NAV_SECTIONS.flatMap((section) => section.items).filter(
    (item) => (role ? roleCanAccessDashboardSection(role, item.section) : false)
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <nav className="border-b border-gray-200 bg-white lg:hidden">
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                isActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              <span className={isActive ? "text-blue-500" : "text-gray-400"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
