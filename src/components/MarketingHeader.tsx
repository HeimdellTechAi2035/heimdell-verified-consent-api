import Link from "next/link";
import { DashboardLoginMenu } from "@/components/DashboardLoginMenu";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
            Heimdell
          </span>
          <span className="hidden text-sm text-gray-500 sm:inline">
            Verified Consent
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <DashboardLoginMenu />
          <Link
            href="/signup"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Sign up
          </Link>
        </div>
      </div>

      <nav className="flex items-center gap-4 overflow-x-auto border-t border-gray-100 px-4 py-2 md:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
