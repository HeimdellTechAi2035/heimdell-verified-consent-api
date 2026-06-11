"use client";
// Embed action button -- reusable CTA for embed panels.
// Supports disabled state, three visual variants, and optional clipboard copy.
// If clipboard API is unavailable (e.g. cross-origin iframe), shows fallback text.

import { useState, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600",
  secondary:
    "border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white",
  ghost:
    "text-blue-600 underline-offset-2 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed",
};

export function EmbedActionButton({
  children,
  disabled = false,
  variant = "secondary",
  copyText,
  title,
}: {
  children:  ReactNode;
  disabled?: boolean;
  variant?:  Variant;
  copyText?: string; // if provided, clicking copies this string to clipboard
  title?:    string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">(
    "idle"
  );

  async function handleCopy() {
    if (!copyText || disabled) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(copyText);
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 2000);
      } catch {
        setCopyState("fallback");
        setTimeout(() => setCopyState("idle"), 5000);
      }
    } else {
      setCopyState("fallback");
      setTimeout(() => setCopyState("idle"), 5000);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={disabled}
        title={title}
        onClick={copyText ? handleCopy : undefined}
        className={`w-full px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${VARIANT_STYLES[variant]}`}
      >
        {copyState === "copied" ? "Copied!" : children}
      </button>

      {/* Fallback: clipboard not available (e.g. cross-origin iframe) */}
      {copyState === "fallback" && copyText && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400 mb-1">
            Clipboard unavailable. Copy manually:
          </p>
          <p className="text-xs font-mono text-gray-600 break-all">{copyText}</p>
        </div>
      )}
    </div>
  );
}
