import type { Prisma, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";
import { normalizeSaleTermsForEvidence } from "@/lib/sale-evidence-display";
import type { ReviewFlagEntry } from "@/lib/dashboard-sales";

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
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  productName: string;
  priceSummary: string;
  verificationStatus: VerificationStatus;
  saleStatus: string;
  needsReview: boolean;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  declinedAt: string | null;
  certificateId: string | null;
};

export type DashboardVerificationDetail = DashboardVerificationRow & {
  customerAddress: string | null;
  openedAt: string | null;
  contractLength: string | null;
  termsSummary: string | null;
  policiesSummary: string | null;
  reviewFlags: ReviewFlagEntry[];
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

function formatPriceSummary(price: { toString(): string }, frequency: string | null) {
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(price.toString()));

  return frequency ? `${amount} / ${frequency}` : amount;
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
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            productName: true,
            productPrice: true,
            productFrequency: true,
            status: true,
            needsReview: true,
            submittedByUser: {
              select: {
                name: true,
                email: true,
              },
            },
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
      customerName: session.sale.customerName,
      customerPhone: session.sale.customerPhone,
      customerEmail: session.sale.customerEmail,
      sellerName: session.sale.submittedByUser?.name ?? null,
      sellerEmail: session.sale.submittedByUser?.email ?? null,
      productName: session.sale.productName,
      priceSummary: formatPriceSummary(
        session.sale.productPrice,
        session.sale.productFrequency
      ),
      verificationStatus: session.status,
      saleStatus: session.sale.status,
      needsReview: session.sale.needsReview,
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

export async function getDashboardVerificationDetail(
  context: OrganizationContext,
  verificationId: string,
  prisma: DashboardVerificationsDb = db
): Promise<DashboardVerificationDetail | null> {
  const normalizedId = verificationId.trim();

  if (!context.organization.id || !normalizedId) {
    return null;
  }

  const session = await prisma.verificationSession.findFirst({
    where: {
      id: normalizedId,
      sale: {
        client: {
          organizationId: context.organization.id,
        },
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      expiresAt: true,
      openedAt: true,
      completedAt: true,
      declinedAt: true,
      certificate: {
        select: { id: true },
      },
      sale: {
        select: {
          id: true,
          clientReference: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          customerAddress: true,
          productName: true,
          productPrice: true,
          productFrequency: true,
          productTerms: true,
          productPolicies: true,
          status: true,
          needsReview: true,
          reviewFlags: true,
          submittedByUser: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const termsEvidence = normalizeSaleTermsForEvidence(session.sale.productTerms);

  return {
    id: session.id,
    saleId: session.sale.id,
    clientReference: session.sale.clientReference ?? "Unreferenced sale",
    customerName: session.sale.customerName,
    customerPhone: session.sale.customerPhone,
    customerEmail: session.sale.customerEmail,
    customerAddress: session.sale.customerAddress,
    sellerName: session.sale.submittedByUser?.name ?? null,
    sellerEmail: session.sale.submittedByUser?.email ?? null,
    productName: session.sale.productName,
    priceSummary: formatPriceSummary(
      session.sale.productPrice,
      session.sale.productFrequency
    ),
    verificationStatus: session.status,
    saleStatus: session.sale.status,
    needsReview: session.sale.needsReview,
    reviewFlags: Array.isArray(session.sale.reviewFlags)
      ? (session.sale.reviewFlags as unknown as ReviewFlagEntry[])
      : [],
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    openedAt: session.openedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    declinedAt: session.declinedAt?.toISOString() ?? null,
    certificateId: session.certificate?.id ?? null,
    contractLength: termsEvidence.contractLength,
    termsSummary: termsEvidence.termsSummary,
    policiesSummary: session.sale.productPolicies,
  };
}
