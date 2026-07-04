import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { roleCanAccessDashboardSection } from "@/lib/dashboard-role-policy";

const DASHBOARD_CREDITS_PAGE_SIZE = 20;

export function assertCanViewDashboardCredits(role: Role): void {
  if (!roleCanAccessDashboardSection(role, "credits")) {
    throw new Error("Dashboard credits access denied.");
  }
}

export type DashboardCreditLedgerRow = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  relatedSaleId: string | null;
  relatedVerificationSessionId: string | null;
  description: string | null;
  createdAt: string;
};

export type DashboardCreditsData = {
  balance: number;
  rows: DashboardCreditLedgerRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export function normalizeDashboardCreditsPage(value: number): number {
  return Number.isFinite(value) && value > 1 ? Math.floor(value) : 1;
}

export async function getDashboardCreditsData(
  context: OrganizationContext,
  params: { page: number }
): Promise<DashboardCreditsData> {
  assertCanViewDashboardCredits(context.membership.role);

  const organizationId = context.organization.id;
  const page = params.page;

  const [balanceRow, totalRows, entries] = await Promise.all([
    db.creditBalance.findUnique({
      where: { organizationId },
      select: { balance: true },
    }),
    db.creditLedgerEntry.count({ where: { organizationId } }),
    db.creditLedgerEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_CREDITS_PAGE_SIZE,
      take: DASHBOARD_CREDITS_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / DASHBOARD_CREDITS_PAGE_SIZE));

  return {
    balance: balanceRow?.balance ?? 0,
    rows: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      relatedSaleId: entry.relatedSaleId,
      relatedVerificationSessionId: entry.relatedVerificationSessionId,
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize: DASHBOARD_CREDITS_PAGE_SIZE,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getOrganizationCreditBalance(organizationId: string): Promise<number> {
  const row = await db.creditBalance.findUnique({
    where: { organizationId },
    select: { balance: true },
  });
  return row?.balance ?? 0;
}
