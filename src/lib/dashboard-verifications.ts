import type { Prisma, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const DASHBOARD_VERIFICATIONS_PAGE_SIZE = 20;

export type DashboardVerificationsFilters = {
  page?: number;
  status?: VerificationStatus | null;
  search?: string | null;
};

export type DashboardVerificationRow = {
  id: string;
  saleId: string;
  clientReference: string;
  productName: string;
  verificationStatus: VerificationStatus;
  saleStatus: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  declinedAt: string | null;
  certificateId: string | null;
};

export type DashboardVerificationsData = {
  rows: DashboardVerificationRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    status: VerificationStatus | null;
    search: string | null;
  };
};

type DashboardVerificationsDb = Pick<Prisma.TransactionClient, "verificationSession">;

const VERIFICATION_STATUSES = [
  "PENDING",
  "OPENED",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
] as const satisfies readonly VerificationStatus[];

export function normalizeDashboardVerificationsPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function normalizeDashboardVerificationsStatus(
  status?: string | null
): VerificationStatus | null {
  const normalized = status?.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  return VERIFICATION_STATUSES.includes(normalized as VerificationStatus)
    ? (normalized as VerificationStatus)
    : null;
}

export function normalizeDashboardVerificationsSearch(
  search?: string | null
): string | null {
  const normalized = search?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 80);
}

export function buildOrganizationVerificationsWhere(params: {
  organizationId: string;
  status?: VerificationStatus | null;
  search?: string | null;
}): Prisma.VerificationSessionWhereInput {
  return {
    sale: {
      client: {
        organizationId: params.organizationId,
      },
    },
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { saleId: { contains: params.search, mode: "insensitive" } },
            {
              sale: {
                clientReference: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };
}

export async function getDashboardVerificationsData(
  context: OrganizationContext,
  filters: DashboardVerificationsFilters = {},
  prisma: DashboardVerificationsDb = db
): Promise<DashboardVerificationsData> {
  const startedAt = nowMs();
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard verifications requires organization context.");
  }

  const page = normalizeDashboardVerificationsPage(filters.page);
  const status = filters.status ?? null;
  const search = normalizeDashboardVerificationsSearch(filters.search);
  const where = buildOrganizationVerificationsWhere({
    organizationId,
    status,
    search,
  });

  const [totalRows, sessions] = await Promise.all([
    prisma.verificationSession.count({ where }),
    prisma.verificationSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_VERIFICATIONS_PAGE_SIZE,
      take: DASHBOARD_VERIFICATIONS_PAGE_SIZE,
      select: {
        id: true,
        saleId: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        completedAt: true,
        declinedAt: true,
        sale: {
          select: {
            id: true,
            clientReference: true,
            productName: true,
            status: true,
          },
        },
        certificate: {
          select: {
            id: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalRows / DASHBOARD_VERIFICATIONS_PAGE_SIZE)
  );

  const data = {
    rows: sessions.map((session) => ({
      id: session.id,
      saleId: session.sale.id,
      clientReference: session.sale.clientReference ?? "Unreferenced sale",
      productName: session.sale.productName,
      verificationStatus: session.status,
      saleStatus: session.sale.status,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      declinedAt: session.declinedAt?.toISOString() ?? null,
      certificateId: session.certificate?.id ?? null,
    })),
    pagination: {
      page,
      pageSize: DASHBOARD_VERIFICATIONS_PAGE_SIZE,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: {
      status,
      search,
    },
  };

  logDashboardTiming("verifications.list", startedAt, {
    rows: data.rows.length,
    totalRows,
    page,
  });

  return data;
}
