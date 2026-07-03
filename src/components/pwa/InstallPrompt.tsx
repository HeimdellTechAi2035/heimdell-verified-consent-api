"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PWA_APP_IDENTITIES, type PwaAppKey } from "@/lib/pwa-identity";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function installedStorageKey(appKey: PwaAppKey): string {
  return `heimdell-pwa-installed:${appKey}`;
}

export function InstallPrompt({ appKey }: { appKey: PwaAppKey }) {
  const identity = PWA_APP_IDENTITIES[appKey];
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(installedStorageKey(appKey)) === "true") {
      return;
    }

    setIos(isIos());
    setVisible(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      window.localStorage.setItem(installedStorageKey(appKey), "true");
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [appKey]);

  if (!visible || dismissed) {
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
            setDeferredPrompt(null);
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
