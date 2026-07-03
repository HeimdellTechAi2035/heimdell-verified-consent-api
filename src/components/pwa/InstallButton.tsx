"use client";

import { useEffect, useState } from "react";
import { isIos, useCapturedInstallPrompt } from "@/lib/pwa-install-capture";

export function InstallButton({ label }: { label: string }) {
  const { deferredPrompt, installed, clear } = useCapturedInstallPrompt();
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());
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
          clear();
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
