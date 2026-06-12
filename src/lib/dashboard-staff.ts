import { randomBytes } from "crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireDashboardRole, type OrganizationContext } from "@/lib/dashboard-auth";
import { isPlatformDashboardRole, STAFF_MANAGER_ROLES } from "@/lib/dashboard-role-policy";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const STAFF_CREATABLE_ROLES = [
  "CLIENT_MANAGER",
  "SELLER",
  "COMPLIANCE_VIEWER",
] as const satisfies readonly Role[];

export type DashboardStaffRow = {
  id: string;
  userId: string;
  externalAuthId: string | null;
  name: string | null;
  email: string;
  role: Role;
  createdAt: Date;
  mustChangePassword: boolean;
  organizationName: string;
};

export type StaffProvisioningInput = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  role: Role;
};

export type StaffPasswordResetResult = {
  targetUserId: string;
  targetName: string | null;
  targetEmail: string;
  temporaryPassword: string;
  loginUrl: string;
};

export async function getDashboardStaffRows(): Promise<DashboardStaffRow[]> {
  const startedAt = nowMs();
  const context = await requireDashboardRole(STAFF_MANAGER_ROLES);

  const memberships = await db.organizationMembership.findMany({
    where: {
      organizationId: context.organization.id,
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          externalAuthId: true,
          name: true,
          email: true,
          mustChangePassword: true,
        },
      },
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  const rows = memberships.map((membership) => ({
    id: membership.id,
    userId: membership.user.id,
    externalAuthId: membership.user.externalAuthId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    createdAt: membership.createdAt,
    mustChangePassword: membership.user.mustChangePassword,
    organizationName: membership.organization.name,
  }));

  logDashboardTiming("staff.list", startedAt, {
    rows: rows.length,
    role: context.membership.role,
  });

  return rows;
}

export function buildStaffProvisioningInput(formData: FormData): StaffProvisioningInput {
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
    role: String(formData.get("role") ?? "") as Role,
  };
}

export function validateStaffProvisioningInput(
  input: StaffProvisioningInput
): string[] {
  const errors: string[] = [];

  if (!input.fullName) {
    errors.push("Full name is required.");
  }

  if (!isValidEmail(input.email)) {
    errors.push("Email must be valid.");
  }

  if (input.temporaryPassword.length < 12) {
    errors.push("Temporary password must be at least 12 characters.");
  }

  if (!canCreateStaffRole(input.role)) {
    errors.push("Selected staff role is not allowed.");
  }

  return errors;
}

export function canCreateStaffRole(role: Role): boolean {
  return (STAFF_CREATABLE_ROLES as readonly Role[]).includes(role);
}

export function generateTemporaryStaffPassword(): string {
  return `Hvcs-${randomBytes(18).toString("base64url")}-9a`;
}

export function canResetStaffPassword(params: {
  actorRole: Role;
  targetRole: Role;
  actorUserId: string;
  targetUserId: string;
}): boolean {
  if (isPlatformDashboardRole(params.actorRole)) {
    return params.actorUserId !== params.targetUserId;
  }

  if (!["CLIENT_OWNER", "CLIENT_MANAGER", "ADMIN"].includes(params.actorRole)) {
    return false;
  }

  if (params.actorUserId === params.targetUserId) {
    return false;
  }

  return (STAFF_CREATABLE_ROLES as readonly Role[]).includes(params.targetRole);
}

export async function prepareStaffPasswordReset(params: {
  context: OrganizationContext;
  targetUserId: string;
  targetOrganizationId?: string | null;
}) {
  const targetOrganizationId =
    params.targetOrganizationId?.trim() || params.context.organization.id;

  if (
    targetOrganizationId !== params.context.organization.id &&
    !isPlatformDashboardRole(params.context.membership.role)
  ) {
    throw new Error("staff_reset_not_allowed");
  }

  const membership = await db.organizationMembership.findFirst({
    where: {
      organizationId: targetOrganizationId,
      userId: params.targetUserId,
    },
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          externalAuthId: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error("staff_reset_target_not_found");
  }

  const externalAuthId = membership.user.externalAuthId;

  if (!externalAuthId) {
    throw new Error("staff_reset_target_missing_auth");
  }

  if (
    !canResetStaffPassword({
      actorRole: params.context.membership.role,
      targetRole: membership.role,
      actorUserId: params.context.user.id,
      targetUserId: membership.user.id,
    })
  ) {
    throw new Error("staff_reset_not_allowed");
  }

  return {
    targetOrganizationId,
    targetUser: {
      ...membership.user,
      externalAuthId,
    },
    targetRole: membership.role,
  };
}

export async function markStaffPasswordChangeRequired(params: {
  targetUserId: string;
}) {
  await db.user.update({
    where: { id: params.targetUserId },
    data: { mustChangePassword: true },
    select: { id: true },
  });
}

export async function assertStaffUserAvailable(email: string) {
  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error("staff_user_exists");
  }
}

export async function createStaffMembership(params: {
  organizationId: string;
  externalAuthId: string;
  input: StaffProvisioningInput;
}) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        externalAuthId: params.externalAuthId,
        email: params.input.email,
        name: params.input.fullName,
        mustChangePassword: true,
      },
      select: { id: true },
    });

    await tx.organizationMembership.create({
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        role: params.input.role,
      },
    });

    return user;
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
