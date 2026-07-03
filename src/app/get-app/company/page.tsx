import type { Metadata, Viewport } from "next";
import { GetAppLanding } from "@/components/pwa/GetAppLanding";
import { PWA_APP_IDENTITIES } from "@/lib/pwa-identity";

const identity = PWA_APP_IDENTITIES.company;

export const metadata: Metadata = {
  title: identity.name,
  manifest: identity.manifestUrl,
};

export const viewport: Viewport = {
  themeColor: identity.themeColor,
};

export default function GetCompanyAppPage() {
  return <GetAppLanding appKey="company" />;
}
