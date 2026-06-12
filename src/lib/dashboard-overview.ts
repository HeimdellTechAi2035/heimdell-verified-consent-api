import type { Prisma, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { logDashboardTiming, nowMs } from "@/lib/dashboard-performance";

export type DashboardOverviewMetrics = {
  totalSales: number;
  pendingVerifications: number;
  completedVerifications: number;
  declinedVerifications: number;
  expiredVerifications: number;
  certificatesIssued: number;
  recentVerificationActivity: number;
  completionRate: number;
};

export type DashboardOverviewActivity = {
  id: string;
  clientReference: string;
  verificationStatus: VerificationStatus;
  activityAt: string;
  productName: string | null;
};

export type DashboardOverviewData = {
  metrics: DashboardOverviewMetrics;
  onboarding: {
    hasCompanyDetails: boolean;
    hasPolicy: boolean;
    sellerCount: number;
    notificationCount: number;
  };
  recentActivity: DashboardOverviewActivity[];
};

type DashboardOverviewDb = Pick<
  Prisma.TransactionClient,
  "sale" | "verificationSession" | "certificate" | "clientPolicy" | "organizationMembership" | "notification"
>;

export function buildOrganizationSaleWhere(
  organizationId: string
): Prisma.SaleWhereInput {
  return {
    client: {
      organizationId,
    },
  };
}

export function buildOrganizationVerificationWhere(
  organizationId: string,
  status?: VerificationStatus
): Prisma.VerificationSessionWhereInput {
  return {
    ...(status ? { status } : {}),
    sale: {
      client: {
        organizationId,
      },
    },
  };
}

export function buildOrganizationCertificateWhere(
  organizationId: string
): Prisma.CertificateWhereInput {
  return {
    verificationSession: {
      sale: {
        client: {
          organizationId,
        },
      },
    },
  };
}

function getActivityTimestamp(session: {
  status: VerificationStatus;
  createdAt: Date;
  openedAt: Date | null;
  completedAt: Date | null;
  declinedAt: Date | null;
}): Date {
  if (session.status === "COMPLETED" && session.completedAt) {
    return session.completedAt;
  }

  if (session.status === "DECLINED" && session.declinedAt) {
    return session.declinedAt;
  }

  return session.openedAt ?? session.createdAt;
}

export function calculateCompletionRate(params: {
  completed: number;
  declined: number;
  expired: number;
  pending: number;
}): number {
  const resolved =
    params.completed + params.declined + params.expired + params.pending;

  if (resolved === 0) {
    return 0;
  }

  return Math.round((params.completed / resolved) * 100);
}

export async function getDashboardOverviewData(
  context: OrganizationContext,
  prisma: DashboardOverviewDb = db
): Promise<DashboardOverviewData> {
  const startedAt = nowMs();
  const organizationId = context.organization.id;

  if (!organizationId) {
    throw new Error("Dashboard overview requires organization context.");
  }

  const [
    totalSales,
    pendingVerifications,
    completedVerifications,
    declinedVerifications,
    expiredVerifications,
    certificatesIssued,
    recentActivityCount,
    policyCount,
    sellerCount,
    notificationCount,
    recentSessions,
  ] = await Promise.all([
    prisma.sale.count({
      where: buildOrganizationSaleWhere(organizationId),
    }),
    prisma.verificationSession.count({
      where: buildOrganizationVerificationWhere(organizationId, "PENDING"),
    }),
    prisma.verificationSession.count({
      where: buildOrganizationVerificationWhere(organizationId, "COMPLETED"),
    }),
    prisma.verificationSession.count({
      where: buildOrganizationVerificationWhere(organizationId, "DECLINED"),
    }),
    prisma.verificationSession.count({
      where: buildOrganizationVerificationWhere(organizationId, "EXPIRED"),
    }),
    prisma.certificate.count({
      where: buildOrganizationCertificateWhere(organizationId),
    }),
    prisma.verificationSession.count({
      where: buildOrganizationVerificationWhere(organizationId),
    }),
    prisma.clientPolicy.count({
      where: {
        client: {
          organizationId,
        },
      },
    }),
    prisma.organizationMembership.count({
      where: {
        organizationId,
        role: "SELLER",
      },
    }),
    prisma.notification.count({
      where: {
        sale: {
          client: {
            organizationId,
          },
        },
      },
    }),
    prisma.verificationSession.findMany({
      where: buildOrganizationVerificationWhere(organizationId),
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        createdAt: true,
        openedAt: true,
        completedAt: true,
        declinedAt: true,
        sale: {
          select: {
            clientReference: true,
            productName: true,
          },
        },
      },
    }),
  ]);

  const data = {
    metrics: {
      totalSales,
      pendingVerifications,
      completedVerifications,
      declinedVerifications,
      expiredVerifications,
      certificatesIssued,
      recentVerificationActivity: recentActivityCount,
      completionRate: calculateCompletionRate({
        completed: completedVerifications,
        declined: declinedVerifications,
        expired: expiredVerifications,
        pending: pendingVerifications,
      }),
    },
    onboarding: {
      hasCompanyDetails: Boolean(
        context.organization.name && context.organization.primaryContactEmail
      ),
      hasPolicy: policyCount > 0,
      sellerCount,
      notificationCount,
    },
    recentActivity: recentSessions.map((session) => ({
      id: session.id,
      clientReference: session.sale.clientReference ?? "Unreferenced sale",
      verificationStatus: session.status,
      activityAt: getActivityTimestamp(session).toISOString(),
      productName: session.sale.productName,
    })),
  };

  logDashboardTiming("overview.data", startedAt, {
    totalSales,
    recentRows: data.recentActivity.length,
  });

  return data;
}
