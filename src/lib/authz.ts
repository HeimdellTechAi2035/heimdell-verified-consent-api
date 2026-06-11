// Auth, tenant, and role helpers.
// Legacy placeholder helpers fail closed; live dashboard auth uses dashboard-auth.ts.

export const ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export type OrganizationMembershipContext = {
  organizationId: string;
  role: Role;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  memberships: OrganizationMembershipContext[];
};

export class AuthNotConfiguredError extends Error {
  constructor() {
    super(
      "This legacy auth helper is not connected. Use the server-side dashboard auth helpers."
    );
    this.name = "AuthNotConfiguredError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(message = "Permission denied") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  throw new AuthNotConfiguredError();
}

export function getOrganizationMembership(
  user: AuthenticatedUser,
  organizationId: string
): OrganizationMembershipContext | null {
  return (
    user.memberships.find(
      (membership) => membership.organizationId === organizationId
    ) ?? null
  );
}

export function requireOrganizationAccess(
  user: AuthenticatedUser,
  organizationId: string
): OrganizationMembershipContext {
  const membership = getOrganizationMembership(user, organizationId);

  if (!membership) {
    throw new PermissionDeniedError("User is not a member of this organization");
  }

  return membership;
}

export function requireRole(
  user: AuthenticatedUser,
  organizationId: string,
  allowedRoles: readonly Role[]
): OrganizationMembershipContext {
  const membership = requireOrganizationAccess(user, organizationId);

  if (!allowedRoles.includes(membership.role)) {
    throw new PermissionDeniedError("User role is not allowed for this action");
  }

  return membership;
}

export function canViewCertificates(role: Role): boolean {
  return [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
    "COMPLIANCE_VIEWER",
  ].includes(role);
}

export function canCreateVerification(role: Role): boolean {
  return [
    "PLATFORM_ADMIN",
    "CLIENT_OWNER",
    "CLIENT_MANAGER",
    "OWNER",
    "ADMIN",
    "MANAGER",
  ].includes(role);
}

export function canManageApiKeys(role: Role): boolean {
  return ["PLATFORM_ADMIN", "OWNER"].includes(role);
}

export function canManageWebhooks(role: Role): boolean {
  return ["PLATFORM_ADMIN", "OWNER"].includes(role);
}
