"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallButton({ label }: { label: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <p className="text-sm text-gray-500">App installed. You can find it on your home screen.</p>;
  }

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          setDeferredPrompt(null);
        }}
        className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
      >
        {label}
      </button>
    );
  }

  if (ios) {
    return (
      <p className="text-sm text-gray-600">
        On iPhone/iPad: tap the Share icon, then &ldquo;Add to Home Screen&rdquo;.
      </p>
    );
  }

  return (
    <p className="text-sm text-gray-600">
      Open this page in Chrome or Edge, then use the browser&rsquo;s &ldquo;Install app&rdquo; option.
    </p>
  );
}
