"use client";

import { useEffect, useState } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __heimdellInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Reads the install prompt captured by public/pwa-capture.js (which runs
 * before-interactive, ahead of any component mounting) so the event isn't
 * lost if beforeinstallprompt fires before this component hydrates.
 */
export function useCapturedInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.__heimdellInstallPrompt) {
      setDeferredPrompt(window.__heimdellInstallPrompt);
    }

    const onCaptured = () => {
      setDeferredPrompt(window.__heimdellInstallPrompt ?? null);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("heimdell:beforeinstallprompt", onCaptured);
    window.addEventListener("heimdell:appinstalled", onInstalled);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("heimdell:beforeinstallprompt", onCaptured);
      window.removeEventListener("heimdell:appinstalled", onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const clear = () => setDeferredPrompt(null);

  return { deferredPrompt, installed, clear };
}
