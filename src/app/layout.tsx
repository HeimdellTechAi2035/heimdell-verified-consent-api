import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const appUrl = process.env.APP_URL ?? "https://telecomcompliance.uk";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Heimdell Verified Consent",
  title: {
    default: "Heimdell Verified Consent",
    template: "%s | Heimdell Verified Consent",
  },
  description:
    "Secure consent verification dashboard for regulated sales teams",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
      },
    ],
  },
  openGraph: {
    title: "Heimdell Verified Consent",
    description:
      "Secure consent verification dashboard for regulated sales teams",
    url: appUrl,
    siteName: "Heimdell Verified Consent",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script src="/pwa-capture.js" strategy="beforeInteractive" />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
