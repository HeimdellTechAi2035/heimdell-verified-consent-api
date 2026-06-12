import type { Prisma, SaleStatus, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";
import { normalizeSaleTermsForEvidence } from "@/lib/sale-evidence-display";

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
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  productName: string;
  productCategory: string | null;
  monthlyPrice: string;
  billingFrequency: string | null;
  priceSummary: string;
  contractLength: string | null;
  saleStatus: SaleStatus;
  latestVerificationStatus: VerificationStatus | null;
  latestVerificationId: string | null;
  latestVerificationCreatedAt: string | null;
  latestVerificationCompletedAt: string | null;
  latestVerificationDeclinedAt: string | null;
  latestVerificationExpiresAt: string | null;
  certificateId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSaleDetail = DashboardSaleRow & {
  termsSummary: string | null;
  policiesSummary: string | null;
  salesChannel: string | null;
  coolingOffDays: number | null;
  aiMarketingOptIn: boolean | null;
  payment: {
    bankName: string | null;
    sortCodeMasked: string | null;
    accountEnding: string | null;
    accountHolderName: string | null;
  } | null;
  verifications: Array<{
    id: string;
    status: VerificationStatus;
    createdAt: string;
    openedAt: string | null;
    completedAt: string | null;
    declinedAt: string | null;
    expiresAt: string;
    certificateId: string | null;
  }>;
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

function formatPriceSummary(price: { toString(): string }, frequency: string | null) {
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(price.toString()));

  return frequency ? `${amount} / ${frequency}` : amount;
}

function maskSortCodeForDashboard(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 2) {
    return "**";
  }

  return `**-**-${digits.slice(-2)}`;
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
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        customerAddress: true,
        productName: true,
        productPrice: true,
        productFrequency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        submittedByUser: {
          select: {
            name: true,
            email: true,
          },
        },
        verificationSessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            declinedAt: true,
            expiresAt: true,
            certificate: {
              select: { id: true },
            },
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
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      customerEmail: sale.customerEmail,
      customerAddress: sale.customerAddress,
      sellerName: sale.submittedByUser?.name ?? null,
      sellerEmail: sale.submittedByUser?.email ?? null,
      productName: sale.productName,
      productCategory: null,
      monthlyPrice: sale.productPrice.toString(),
      billingFrequency: sale.productFrequency,
      priceSummary: formatPriceSummary(sale.productPrice, sale.productFrequency),
      contractLength: null,
      saleStatus: sale.status,
      latestVerificationStatus: getLatestVerificationStatus(
        sale.verificationSessions
      ),
      latestVerificationId: sale.verificationSessions[0]?.id ?? null,
      latestVerificationCreatedAt:
        sale.verificationSessions[0]?.createdAt.toISOString() ?? null,
      latestVerificationCompletedAt:
        sale.verificationSessions[0]?.completedAt?.toISOString() ?? null,
      latestVerificationDeclinedAt:
        sale.verificationSessions[0]?.declinedAt?.toISOString() ?? null,
      latestVerificationExpiresAt:
        sale.verificationSessions[0]?.expiresAt.toISOString() ?? null,
      certificateId: sale.verificationSessions[0]?.certificate?.id ?? null,
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

export async function getDashboardSaleDetail(
  context: OrganizationContext,
  saleId: string,
  options: { sellerScoped?: boolean } = {},
  prisma: DashboardSalesDb = db
): Promise<DashboardSaleDetail | null> {
  const normalizedId = saleId.trim();

  if (!context.organization.id || !normalizedId) {
    return null;
  }

  const sale = await prisma.sale.findFirst({
    where: {
      id: normalizedId,
      ...(options.sellerScoped ? { submittedByUserId: context.user.id } : {}),
      client: {
        organizationId: context.organization.id,
      },
    },
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
      salesChannel: true,
      aiMarketingOptIn: true,
      coolingOffDays: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      submittedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
      directDebitMandate: {
        select: {
          bankName: true,
          sortCode: true,
          accountNumberLast4: true,
          accountHolderName: true,
        },
      },
      verificationSessions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          openedAt: true,
          completedAt: true,
          declinedAt: true,
          expiresAt: true,
          certificate: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!sale) {
    return null;
  }

  const latestSession = sale.verificationSessions[0];
  const termsEvidence = normalizeSaleTermsForEvidence(sale.productTerms);

  return {
    id: sale.id,
    saleReference: sale.id,
    clientReference: sale.clientReference ?? "Unreferenced sale",
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerEmail: sale.customerEmail,
    customerAddress: sale.customerAddress,
    sellerName: sale.submittedByUser?.name ?? null,
    sellerEmail: sale.submittedByUser?.email ?? null,
    productName: sale.productName,
    productCategory: null,
    monthlyPrice: sale.productPrice.toString(),
    billingFrequency: sale.productFrequency,
    priceSummary: formatPriceSummary(sale.productPrice, sale.productFrequency),
    contractLength: termsEvidence.contractLength,
    saleStatus: sale.status,
    latestVerificationStatus: latestSession?.status ?? null,
    latestVerificationId: latestSession?.id ?? null,
    latestVerificationCreatedAt: latestSession?.createdAt.toISOString() ?? null,
    latestVerificationCompletedAt:
      latestSession?.completedAt?.toISOString() ?? null,
    latestVerificationDeclinedAt: latestSession?.declinedAt?.toISOString() ?? null,
    latestVerificationExpiresAt: latestSession?.expiresAt.toISOString() ?? null,
    certificateId: latestSession?.certificate?.id ?? null,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    termsSummary: termsEvidence.termsSummary,
    policiesSummary: sale.productPolicies,
    salesChannel: sale.salesChannel,
    coolingOffDays: sale.coolingOffDays,
    aiMarketingOptIn: sale.aiMarketingOptIn,
    payment: sale.directDebitMandate
      ? {
          bankName: sale.directDebitMandate.bankName,
          sortCodeMasked: maskSortCodeForDashboard(
            sale.directDebitMandate.sortCode
          ),
          accountEnding: `Account ending ${sale.directDebitMandate.accountNumberLast4}`,
          accountHolderName: sale.directDebitMandate.accountHolderName,
        }
      : null,
    verifications: sale.verificationSessions.map((session) => ({
      id: session.id,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      openedAt: session.openedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      declinedAt: session.declinedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      certificateId: session.certificate?.id ?? null,
    })),
  };
}
