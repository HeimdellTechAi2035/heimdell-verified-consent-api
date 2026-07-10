"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISSED_KEY = "heimdell_cookie_notice_dismissed";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(DISMISSED_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (e.g. private browsing edge cases) -- just skip the notice.
    }
  }, []);

  if (!visible) {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore -- worst case the notice reappears next visit.
    }
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-gray-600">
          We only use one cookie — to keep you signed in. No analytics, no tracking.{" "}
          <Link href="/cookies" className="font-medium text-blue-600 hover:underline">
            Learn more
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
