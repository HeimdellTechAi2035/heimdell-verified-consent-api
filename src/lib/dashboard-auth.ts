import type { Organization, OrganizationMembership, Role, User } from "@prisma/client";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export type DashboardUser = User;

export type OrganizationContext = {
  user: DashboardUser;
  organization: Organization;
  membership: OrganizationMembership;
};

export type DashboardAccessState =
  | { status: "unauthenticated" }
  | { status: "missing_user_mapping"; externalAuthId: string; email: string | null }
  | { status: "missing_membership"; user: DashboardUser }
  | { status: "authenticated"; context: OrganizationContext }
  | {
      status: "insufficient_role";
      context: OrganizationContext;
      requiredRoles: readonly Role[];
    };

export type SupabaseDashboardIdentity = {
  id: string;
  email?: string | null;
};

type InternalUserWithMemberships = User & {
  memberships: Array<OrganizationMembership & { organization: Organization }>;
};

export function resolveDashboardAccessState(params: {
  authUser: SupabaseDashboardIdentity | null;
  internalUser: InternalUserWithMemberships | null;
}): DashboardAccessState {
  if (!params.authUser) {
    return { status: "unauthenticated" };
  }

  if (!params.internalUser) {
    return {
      status: "missing_user_mapping",
      externalAuthId: params.authUser.id,
      email: params.authUser.email ?? null,
    };
  }

  const membership = params.internalUser.memberships[0];

  if (!membership) {
    return { status: "missing_membership", user: params.internalUser };
  }

  const { organization, ...membershipOnly } = membership;

  return {
    status: "authenticated",
    context: {
      user: params.internalUser,
      organization,
      membership: membershipOnly,
    },
  };
}

export const getCurrentDashboardUser = cache(async (): Promise<DashboardUser | null> => {
  const startedAt = nowMs();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    logDashboardTiming("auth.current_user", startedAt, { status: "none" });
    return null;
  }

  const user = await db.user.findUnique({
    where: { externalAuthId: data.user.id },
  });

  logDashboardTiming("auth.current_user", startedAt, {
    status: user ? "mapped" : "missing_mapping",
  });

  return user;
});

export async function requireDashboardUser(): Promise<DashboardUser> {
  const user = await getCurrentDashboardUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export const getDashboardAccessState = cache(async (): Promise<DashboardAccessState> => {
  const startedAt = nowMs();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    logDashboardTiming("auth.access_state", startedAt, { status: "unauthenticated" });
    return { status: "unauthenticated" };
  }

  const internalUser = await db.user.findUnique({
    where: { externalAuthId: data.user.id },
    include: {
      memberships: {
        where: {
          organization: {
            archivedAt: null,
          },
        },
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const state = resolveDashboardAccessState({
    authUser: { id: data.user.id, email: data.user.email },
    internalUser,
  });

  logDashboardTiming("auth.access_state", startedAt, { status: state.status });

  return state;
});

export async function getCurrentOrganizationContext(): Promise<OrganizationContext | null> {
  const state = await getDashboardAccessState();
  return state.status === "authenticated" ? state.context : null;
}

export async function requireOrganizationMembership(): Promise<OrganizationContext> {
  const state = await getDashboardAccessState();

  if (state.status === "unauthenticated") {
    redirect("/login");
  }

  if (state.status !== "authenticated") {
    throw new Error("No organization access configured for this dashboard user.");
  }

  return state.context;
}

export async function getDashboardRoleAccessState(
  requiredRoles: readonly Role[]
): Promise<DashboardAccessState> {
  const state = await getDashboardAccessState();

  if (state.status !== "authenticated") {
    return state;
  }

  if (!requiredRoles.includes(state.context.membership.role)) {
    return {
      status: "insufficient_role",
      context: state.context,
      requiredRoles,
    };
  }

  return state;
}

export async function requireDashboardRole(
  requiredRoles: readonly Role[]
): Promise<OrganizationContext> {
  const state = await getDashboardRoleAccessState(requiredRoles);

  if (state.status === "unauthenticated") {
    redirect("/login");
  }

  if (state.status !== "authenticated") {
    throw new Error("Dashboard role requirement was not satisfied.");
  }

  return state.context;
}
