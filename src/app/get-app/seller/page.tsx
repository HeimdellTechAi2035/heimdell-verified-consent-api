import type { Metadata, Viewport } from "next";
import { GetAppLanding } from "@/components/pwa/GetAppLanding";
import { PWA_APP_IDENTITIES } from "@/lib/pwa-identity";

const identity = PWA_APP_IDENTITIES.seller;

export const metadata: Metadata = {
  title: identity.name,
  manifest: identity.manifestUrl,
};

export const viewport: Viewport = {
  themeColor: identity.themeColor,
};

export default function GetSellerAppPage() {
  return <GetAppLanding appKey="seller" />;
}
