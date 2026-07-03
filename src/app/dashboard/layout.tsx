// Dashboard shell layout — shared across all /dashboard/* routes.
// Phase 12B: delegates shell and sidebar to reusable components.

import { type ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardAccessGate } from "@/components/dashboard/DashboardAccessGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDashboardAccessState } from "@/lib/dashboard-auth";
import { PWA_APP_IDENTITIES, getPwaAppKeyForRole } from "@/lib/pwa-identity";

export async function generateMetadata(): Promise<Metadata> {
  const state = await getDashboardAccessState();

  if (state.status !== "authenticated") {
    return {};
  }

  const identity = PWA_APP_IDENTITIES[getPwaAppKeyForRole(state.context.membership.role)];

  return {
    manifest: identity.manifestUrl,
    applicationName: identity.name,
    title: identity.name,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const state = await getDashboardAccessState();

  if (state.status !== "authenticated") {
    return {};
  }

  const identity = PWA_APP_IDENTITIES[getPwaAppKeyForRole(state.context.membership.role)];

  return {
    themeColor: identity.themeColor,
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const state = await getDashboardAccessState();

  if (state.status === "unauthenticated") {
    redirect("/login");
  }

  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-heimdell-pathname") ?? "";

  if (state.status === "authenticated" && state.context.user.mustChangePassword) {
    if (pathname !== "/dashboard/change-password") {
      redirect("/dashboard/change-password");
    }
  }

  if (
    state.status === "authenticated" &&
    state.context.membership.role === "SELLER" &&
    (pathname === "/dashboard" || pathname === "/dashboard/overview")
  ) {
    redirect("/dashboard/my-sales");
  }

  return (
    <DashboardShell
      context={state.status === "authenticated" ? state.context : undefined}
    >
      <DashboardAccessGate state={state}>{children}</DashboardAccessGate>
    </DashboardShell>
  );
}
