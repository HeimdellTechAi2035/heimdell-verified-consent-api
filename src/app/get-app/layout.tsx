// Get-app layout — shared across /get-app/* install landing pages.
// Minimal, pre-auth, chrome-free. No sidebar, no dashboard shell.

import { type ReactNode } from "react";
import { LegalFooter } from "@/components/LegalFooter";

export default function GetAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1">{children}</div>
      <LegalFooter className="shrink-0 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400" />
    </div>
  );
}
