import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-processing-agreement", label: "Data Processing Agreement" },
  { href: "/cooling-off", label: "Cooling-Off & Cancellation" },
  { href: "/cookies", label: "Cookies" },
  { href: "/complaints", label: "Complaints" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <LegalFooter className="border-t border-gray-100" />
    </footer>
  );
}
