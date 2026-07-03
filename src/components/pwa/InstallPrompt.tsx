"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PWA_APP_IDENTITIES, type PwaAppKey } from "@/lib/pwa-identity";
import { isIos, useCapturedInstallPrompt } from "@/lib/pwa-install-capture";

function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function installedStorageKey(appKey: PwaAppKey): string {
  return `heimdell-pwa-installed:${appKey}`;
}

export function InstallPrompt({ appKey }: { appKey: PwaAppKey }) {
  const identity = PWA_APP_IDENTITIES[appKey];
  const { deferredPrompt, installed, clear } = useCapturedInstallPrompt();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(installedStorageKey(appKey)) === "true") {
      return;
    }
    setIos(isIos());
    setEligible(true);
  }, [appKey]);

  useEffect(() => {
    if (installed) {
      window.localStorage.setItem(installedStorageKey(appKey), "true");
    }
  }, [installed, appKey]);

  if (!eligible || installed || dismissed) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-2.5 sm:px-6 lg:px-8"
      style={{ backgroundColor: `${identity.themeColor}14`, borderColor: `${identity.themeColor}33` }}
    >
      <Image src={identity.icons[0].src} alt="" width={28} height={28} className="h-7 w-7 rounded-md" unoptimized />

      <div className="min-w-0 flex-1 text-xs text-gray-700 sm:text-sm">
        <span className="font-medium text-gray-900">Get {identity.name}</span>{" "}
        {deferredPrompt ? (
          <span>on your home screen for quicker access.</span>
        ) : ios ? (
          <span>— tap Share, then &ldquo;Add to Home Screen&rdquo;.</span>
        ) : (
          <span>— use your browser&rsquo;s &ldquo;Install app&rdquo; option.</span>
        )}
      </div>

      {deferredPrompt && (
        <button
          type="button"
          onClick={async () => {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            clear();
          }}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
          style={{ backgroundColor: identity.themeColor }}
        >
          Install
        </button>
      )}

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-gray-400 hover:text-gray-600"
      >
        &times;
      </button>
    </div>
  );
}
