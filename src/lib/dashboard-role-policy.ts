import type { Role } from "@prisma/client";

export const DASHBOARD_SECTIONS = [
  "overview",
  "my-sales",
  "sales",
  "verifications",
  "certificates",
  "staff",
  "clients",
  "api-keys",
  "webhooks",
  "settings",
  "integrations",
  "notifications",
  "credits",
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

const CLIENT_MANAGER_AND_ABOVE = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
] as const satisfies readonly Role[];

const SELLER_SAFE_SALES_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
] as const satisfies readonly Role[];

const CERTIFICATE_VIEW_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "COMPLIANCE_VIEWER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
] as const satisfies readonly Role[];

const PLATFORM_ADMIN_ROLES = [
  "PLATFORM_ADMIN",
  "OWNER",
] as const satisfies readonly Role[];

export const CLIENT_OWNER_AND_PLATFORM_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
] as const satisfies readonly Role[];

export const STAFF_MANAGER_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
] as const satisfies readonly Role[];

export const DASHBOARD_SECTION_ROLES = {
  overview: [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
    "COMPLIANCE_VIEWER",
  ],
  "my-sales": SELLER_SAFE_SALES_ROLES,
  sales: CLIENT_MANAGER_AND_ABOVE,
  verifications: CLIENT_MANAGER_AND_ABOVE,
  certificates: CERTIFICATE_VIEW_ROLES,
  staff: STAFF_MANAGER_ROLES,
  clients: PLATFORM_ADMIN_ROLES,
  "api-keys": PLATFORM_ADMIN_ROLES,
  webhooks: PLATFORM_ADMIN_ROLES,
  settings: CLIENT_OWNER_AND_PLATFORM_ROLES,
  integrations: PLATFORM_ADMIN_ROLES,
  notifications: CLIENT_OWNER_AND_PLATFORM_ROLES,
  credits: CLIENT_OWNER_AND_PLATFORM_ROLES,
} as const satisfies Record<DashboardSection, readonly Role[]>;

export function isPlatformDashboardRole(role: Role): boolean {
  return (PLATFORM_ADMIN_ROLES as readonly Role[]).includes(role);
}

export function isDashboardSection(value: string): value is DashboardSection {
  return DASHBOARD_SECTIONS.includes(value as DashboardSection);
}

export function getAllowedDashboardRoles(section: string): readonly Role[] {
  if (!isDashboardSection(section)) {
    return [];
  }

  return DASHBOARD_SECTION_ROLES[section];
}

export function roleCanAccessDashboardSection(
  role: Role,
  section: string
): boolean {
  return getAllowedDashboardRoles(section).includes(role);
}
