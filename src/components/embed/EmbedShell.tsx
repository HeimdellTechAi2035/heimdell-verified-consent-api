// EmbedShell -- compact iframe-friendly wrapper for all embed pages.
// Provides: Heimdell-branded compact header, content slot, "Secure consent infrastructure" footer.
// No dashboard sidebar. Light, neutral UI.

import { type ReactNode } from "react";

export function EmbedShell({
  children,
  title,
  sessionId,
  badge,
}: {
  children:    ReactNode;
  title?:      string;
  sessionId?:  string;
  badge?:      ReactNode;
}) {
  return (
    <div className="min-h-0">
      {/* Compact Heimdell-branded header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-blue-500 uppercase">
            Heimdell
          </span>
          {title && (
            <span className="text-xs text-gray-400 truncate">/ {title}</span>
          )}
        </div>
        {badge}
      </div>

      {/* Session ID hint (if provided) */}
      {sessionId && (
        <div className="px-4 pt-2">
          <p className="text-xs font-mono text-gray-300 break-all">{sessionId}</p>
        </div>
      )}

      {/* Main content */}
      <div className="p-4">{children}</div>

      {/* Branding footer */}
      <div className="px-4 py-2 border-t border-gray-50">
        <p className="text-xs text-gray-300">Secure consent infrastructure</p>
      </div>
    </div>
  );
}
