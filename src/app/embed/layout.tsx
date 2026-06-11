// Embed layout — shared across /embed/* routes.
// Minimal, CRM-friendly, iframe-safe. No sidebar, no dashboard chrome.
// Subtle Heimdell branding in a compact footer only.

import { type ReactNode } from "react";
import { LegalFooter } from "@/components/LegalFooter";

export const metadata = {
  title: "Heimdell Verified Consent",
};

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Content fills available space */}
      <div className="flex-1">{children}</div>

      <LegalFooter className="shrink-0 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400" />
    </div>
  );
}
