// Dashboard shell layout — shared across all /dashboard/* routes.
// Phase 12B: delegates shell and sidebar to reusable components.

import { type ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardAccessGate } from "@/components/dashboard/DashboardAccessGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDashboardAccessState } from "@/lib/dashboard-auth";

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
