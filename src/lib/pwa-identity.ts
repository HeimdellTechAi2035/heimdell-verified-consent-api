import type { Role } from "@prisma/client";
import type { MetadataRoute } from "next";

export type PwaAppKey = "company" | "client" | "seller";

export const ROLE_TO_PWA_APP_KEY = {
  PLATFORM_ADMIN: "company",
  OWNER: "company",
  CLIENT_OWNER: "client",
  CLIENT_MANAGER: "client",
  ADMIN: "client",
  MANAGER: "client",
  COMPLIANCE_VIEWER: "client",
  SELLER: "seller",
} as const satisfies Record<Role, PwaAppKey>;

type PwaAppIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: "any";
};

export type PwaAppIdentity = {
  key: PwaAppKey;
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  icons: PwaAppIcon[];
  manifestUrl: string;
  id: string;
  startUrl: string;
  scope: string;
};

function svgIcons(basePath: string): PwaAppIcon[] {
  return [
    { src: `${basePath}/icon-192.svg`, sizes: "192x192", type: "image/svg+xml", purpose: "any" },
    { src: `${basePath}/icon-512.svg`, sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    { src: `${basePath}/apple-touch-icon.svg`, sizes: "180x180", type: "image/svg+xml", purpose: "any" },
  ];
}

export const PWA_APP_IDENTITIES = {
  company: {
    key: "company",
    name: "Heimdell Company",
    shortName: "Heimdell Co",
    description: "Platform administration for the Heimdell Verified Consent network.",
    themeColor: "#f59e0b",
    backgroundColor: "#f9fafb",
    icons: svgIcons("/icons/company"),
    manifestUrl: "/get-app/company/manifest.webmanifest",
    id: "/get-app/company",
    startUrl: "/login/company",
    scope: "/",
  },
  client: {
    key: "client",
    name: "Heimdell Client",
    shortName: "Heimdell Client",
    description: "Consent verification dashboard for regulated sales teams.",
    themeColor: "#2563eb",
    backgroundColor: "#f9fafb",
    icons: svgIcons("/icons"),
    manifestUrl: "/get-app/client/manifest.webmanifest",
    id: "/get-app/client",
    startUrl: "/login/client",
    scope: "/",
  },
  seller: {
    key: "seller",
    name: "Heimdell Seller",
    shortName: "Heimdell Seller",
    description: "Submit sales and track verification status on the go.",
    themeColor: "#16a34a",
    backgroundColor: "#f9fafb",
    icons: svgIcons("/icons/seller"),
    manifestUrl: "/get-app/seller/manifest.webmanifest",
    id: "/get-app/seller",
    startUrl: "/login/seller",
    scope: "/",
  },
} as const satisfies Record<PwaAppKey, PwaAppIdentity>;

export function getPwaAppKeyForRole(role: Role): PwaAppKey {
  return ROLE_TO_PWA_APP_KEY[role];
}

export function isPwaAppKey(value: string): value is PwaAppKey {
  return value === "company" || value === "client" || value === "seller";
}

export function getManifestUrlForRole(role: Role): string {
  return PWA_APP_IDENTITIES[getPwaAppKeyForRole(role)].manifestUrl;
}

export function buildManifest(appKey: PwaAppKey): MetadataRoute.Manifest {
  const identity = PWA_APP_IDENTITIES[appKey];

  return {
    id: identity.id,
    name: identity.name,
    short_name: identity.shortName,
    description: identity.description,
    start_url: identity.startUrl,
    scope: identity.scope,
    display: "standalone",
    background_color: identity.backgroundColor,
    theme_color: identity.themeColor,
    icons: identity.icons,
  };
}
