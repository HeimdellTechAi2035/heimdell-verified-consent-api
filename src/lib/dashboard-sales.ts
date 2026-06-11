import type { Prisma, SaleStatus, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const DASHBOARD_SALES_PAGE_SIZE = 20;

export type DashboardSalesFilters = {
  page?: number;
  status?: SaleStatus | null;
  search?: string | null;
};

export type DashboardSaleRow = {
  id: string;
  saleReference: string;
  clientReference: string;
  productName: string;
  productCategory: string | null;
  monthlyPrice: string;
  billingFrequency: string | null;
  contractLength: string | null;
  saleStatus: SaleStatus;
  latestVerificationStatus: VerificationStatus | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSalesData = {
  rows: DashboardSaleRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    status: SaleStatus | null;
    search: string | null;
  };
};

type DashboardSalesDb = Pick<Prisma.TransactionClient, "sale">;

const SALE_STATUSES = [
  "PENDING",
  "VERIFICATION_SENT",
  "VERIFIED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
] as const satisfies readonly SaleStatus[];

export function normalizeDashboardSalesPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function normalizeDashboardSalesStatus(
  status?: string | null
): SaleStatus | null {
  const normalized = status?.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  return SALE_STATUSES.includes(normalized as SaleStatus)
    ? (normalized as SaleStatus)
    : null;
}

export function normalizeDashboardSalesSearch(
  search?: string | null
): string | null {
  const normalized = search?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 80);
}

export function buildOrganizationSalesWhere(params: {
  organizationId: string;
  status?: SaleStatus | null;
  search?: string | null;
}): Prisma.SaleWhereInput {
  return {
    client: {
      organizationId: params.organizationId,
    },
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { id: { contains: params.search, mode: "insensitive" } },
            {
              clientReference: {
                contains: params.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
}

function getLatestVerificationStatus(
  sessions: Array<{ status: VerificationStatus }>
): VerificationStatus | null {
  return sessions[0]?.status ?? null;
}

export async function getDashboardSalesData(
  context: OrganizationContext,
  filters: DashboardSalesFilters = {},
  prisma: DashboardSalesDb = db
): Promise<DashboardSalesData> {
  const startedAt = nowMs();
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard sales requires organization context.");
  }

  const page = normalizeDashboardSalesPage(filters.page);
  const status = filters.status ?? null;
  const search = normalizeDashboardSalesSearch(filters.search);
  const where = buildOrganizationSalesWhere({
    organizationId,
    status,
    search,
  });

  const [totalRows, sales] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_SALES_PAGE_SIZE,
      take: DASHBOARD_SALES_PAGE_SIZE,
      select: {
        id: true,
        clientReference: true,
        productName: true,
        productPrice: true,
        productFrequency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        verificationSessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / DASHBOARD_SALES_PAGE_SIZE));

  const data = {
    rows: sales.map((sale) => ({
      id: sale.id,
      saleReference: sale.id,
      clientReference: sale.clientReference ?? "Unreferenced sale",
      productName: sale.productName,
      productCategory: null,
      monthlyPrice: sale.productPrice.toString(),
      billingFrequency: sale.productFrequency,
      contractLength: null,
      saleStatus: sale.status,
      latestVerificationStatus: getLatestVerificationStatus(
        sale.verificationSessions
      ),
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize: DASHBOARD_SALES_PAGE_SIZE,
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

  logDashboardTiming("sales.list", startedAt, {
    rows: data.rows.length,
    totalRows,
    page,
  });

  return data;
}
