import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export const DASHBOARD_CERTIFICATES_PAGE_SIZE = 20;

export type DashboardCertificatesFilters = {
  page?: number;
  search?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
};

export type DashboardCertificateRow = {
  id: string;
  verificationSessionId: string;
  saleId: string;
  clientReference: string;
  productName: string;
  verificationStatus: string;
  saleStatus: string;
  createdAt: string;
  completedAt: string | null;
  proofHashFingerprint: string;
  certificateVersion: string | null;
};

export type DashboardCertificatesData = {
  rows: DashboardCertificateRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    search: string | null;
    createdFrom: string | null;
    createdTo: string | null;
  };
};

type DashboardCertificatesDb = Pick<Prisma.TransactionClient, "certificate">;

export function normalizeDashboardCertificatesPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

export function normalizeDashboardCertificatesSearch(
  search?: string | null
): string | null {
  const normalized = search?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 80);
}

export function normalizeDashboardCertificateDate(
  value?: string | null
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : normalized;
}

export function createProofHashFingerprint(proofHash: string): string {
  if (proofHash.length <= 16) {
    return proofHash;
  }

  return `${proofHash.slice(0, 12)}...${proofHash.slice(-4)}`;
}

function buildCreatedAtFilter(params: {
  createdFrom?: string | null;
  createdTo?: string | null;
}): Prisma.DateTimeFilter | undefined {
  const createdAt: Prisma.DateTimeFilter = {};

  if (params.createdFrom) {
    createdAt.gte = new Date(params.createdFrom);
  }

  if (params.createdTo) {
    createdAt.lte = new Date(params.createdTo);
  }

  return Object.keys(createdAt).length > 0 ? createdAt : undefined;
}

export function buildOrganizationCertificatesWhere(params: {
  organizationId: string;
  search?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
}): Prisma.CertificateWhereInput {
  const createdAt = buildCreatedAtFilter({
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  });

  return {
    verificationSession: {
      sale: {
        client: {
          organizationId: params.organizationId,
        },
      },
    },
    ...(createdAt ? { createdAt } : {}),
    ...(params.search
      ? {
          OR: [
            {
              verificationSessionId: {
                contains: params.search,
                mode: "insensitive",
              },
            },
            {
              verificationSession: {
                saleId: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
            },
            {
              verificationSession: {
                sale: {
                  clientReference: {
                    contains: params.search,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
}

export async function getDashboardCertificatesData(
  context: OrganizationContext,
  filters: DashboardCertificatesFilters = {},
  prisma: DashboardCertificatesDb = db
): Promise<DashboardCertificatesData> {
  const startedAt = nowMs();
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard certificates requires organization context.");
  }

  const page = normalizeDashboardCertificatesPage(filters.page);
  const search = normalizeDashboardCertificatesSearch(filters.search);
  const createdFrom = normalizeDashboardCertificateDate(filters.createdFrom);
  const createdTo = normalizeDashboardCertificateDate(filters.createdTo);
  const where = buildOrganizationCertificatesWhere({
    organizationId,
    search,
    createdFrom,
    createdTo,
  });

  const [totalRows, certificates] = await Promise.all([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * DASHBOARD_CERTIFICATES_PAGE_SIZE,
      take: DASHBOARD_CERTIFICATES_PAGE_SIZE,
      select: {
        id: true,
        verificationSessionId: true,
        proofHash: true,
        createdAt: true,
        verificationSession: {
          select: {
            id: true,
            saleId: true,
            status: true,
            completedAt: true,
            sale: {
              select: {
                id: true,
                clientReference: true,
                productName: true,
                status: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(totalRows / DASHBOARD_CERTIFICATES_PAGE_SIZE)
  );

  const data = {
    rows: certificates.map((certificate) => ({
      id: certificate.id,
      verificationSessionId: certificate.verificationSession.id,
      saleId: certificate.verificationSession.sale.id,
      clientReference:
        certificate.verificationSession.sale.clientReference ??
        "Unreferenced sale",
      productName: certificate.verificationSession.sale.productName,
      verificationStatus: certificate.verificationSession.status,
      saleStatus: certificate.verificationSession.sale.status,
      createdAt: certificate.createdAt.toISOString(),
      completedAt:
        certificate.verificationSession.completedAt?.toISOString() ?? null,
      proofHashFingerprint: createProofHashFingerprint(certificate.proofHash),
      certificateVersion: null,
    })),
    pagination: {
      page,
      pageSize: DASHBOARD_CERTIFICATES_PAGE_SIZE,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: {
      search,
      createdFrom,
      createdTo,
    },
  };

  logDashboardTiming("certificates.list", startedAt, {
    rows: data.rows.length,
    totalRows,
    page,
  });

  return data;
}
