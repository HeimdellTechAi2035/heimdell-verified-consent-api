import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { createProofHashFingerprint } from "@/lib/dashboard-certificates";

type DashboardCertificateDetailDb = Pick<Prisma.TransactionClient, "certificate">;

type CertificateJsonValue = Record<string, unknown>;

export type DashboardCertificateDetail = {
  id: string;
  proofHash: string;
  proofHashFingerprint: string;
  certificateVersion: string | null;
  createdAt: string;
  sale: {
    id: string;
    clientReference: string;
    status: string;
    productName: string;
    priceSummary: string;
    termsSummary: string | null;
    policiesSummary: string | null;
    coolingOffSummary: string | null;
  };
  verification: {
    sessionId: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    declinedAt: string | null;
    expiresAt: string;
  };
  confirmations: Array<{
    label: string;
    value: boolean | string | null;
  }>;
  paymentSummary: {
    accountEnding: string | null;
    sortCodeMasked: string | null;
  };
  timeline: Array<{
    type: string;
    at: string;
  }>;
};

export class DashboardCertificateDetailNotFoundError extends Error {
  constructor() {
    super("Certificate not found");
    this.name = "DashboardCertificateDetailNotFoundError";
  }
}

function stringFromJson(
  value: CertificateJsonValue,
  key: string
): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : null;
}

function booleanFromJson(
  value: CertificateJsonValue,
  key: string
): boolean | null {
  const field = value[key];
  return typeof field === "boolean" ? field : null;
}

export function maskSortCodeForDashboard(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 2) {
    return "**";
  }

  return `**-**-${digits.slice(-2)}`;
}

export function buildCertificateDetailViewModel(certificate: {
  id: string;
  proofHash: string;
  createdAt: Date;
  certificateJson: Prisma.JsonValue;
  verificationSession: {
    id: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
    completedAt: Date | null;
    declinedAt: Date | null;
    consentEvents: Array<{
      eventType: string;
      createdAt: Date;
    }>;
    sale: {
      id: string;
      clientReference: string | null;
      productName: string;
      productPrice: { toString(): string };
      productFrequency: string | null;
      productTerms: string | null;
      productPolicies: string | null;
      coolingOffDays: number | null;
      status: string;
    };
  };
}): DashboardCertificateDetail {
  const certificateJson =
    certificate.certificateJson &&
    typeof certificate.certificateJson === "object" &&
    !Array.isArray(certificate.certificateJson)
      ? (certificate.certificateJson as CertificateJsonValue)
      : {};
  const sale = certificate.verificationSession.sale;
  const price = sale.productPrice.toString();
  const frequency = sale.productFrequency ? ` / ${sale.productFrequency}` : "";
  const coolingOffDays =
    sale.coolingOffDays ??
    (typeof certificateJson.cooling_off_days === "number"
      ? certificateJson.cooling_off_days
      : null);
  const accountLast4 = stringFromJson(
    certificateJson,
    "direct_debit_account_last4"
  );

  return {
    id: certificate.id,
    proofHash: certificate.proofHash,
    proofHashFingerprint: createProofHashFingerprint(certificate.proofHash),
    certificateVersion: stringFromJson(certificateJson, "_version"),
    createdAt: certificate.createdAt.toISOString(),
    sale: {
      id: sale.id,
      clientReference: sale.clientReference ?? "Unreferenced sale",
      status: sale.status,
      productName: sale.productName,
      priceSummary: `${price}${frequency}`,
      termsSummary:
        sale.productTerms ?? stringFromJson(certificateJson, "terms_summary"),
      policiesSummary:
        sale.productPolicies ??
        stringFromJson(certificateJson, "policies_summary"),
      coolingOffSummary:
        coolingOffDays == null ? null : `${coolingOffDays} day cooling-off period`,
    },
    verification: {
      sessionId: certificate.verificationSession.id,
      status: certificate.verificationSession.status,
      createdAt: certificate.verificationSession.createdAt.toISOString(),
      completedAt:
        certificate.verificationSession.completedAt?.toISOString() ?? null,
      declinedAt:
        certificate.verificationSession.declinedAt?.toISOString() ?? null,
      expiresAt: certificate.verificationSession.expiresAt.toISOString(),
    },
    confirmations: [
      {
        label: "Terms acknowledged",
        value: booleanFromJson(certificateJson, "terms_acknowledged"),
      },
      {
        label: "Policies acknowledged",
        value: booleanFromJson(certificateJson, "policies_acknowledged"),
      },
      {
        label: "Cooling-off rights acknowledged",
        value: booleanFromJson(certificateJson, "cooling_off_acknowledged"),
      },
      {
        label: "Direct Debit authorised",
        value: booleanFromJson(certificateJson, "direct_debit_authorised"),
      },
      {
        label: "Evidence storage acknowledged",
        value: booleanFromJson(
          certificateJson,
          "evidence_storage_acknowledged"
        ),
      },
      {
        label: "Typed name confirmation",
        value: stringFromJson(certificateJson, "typed_name") ? "Recorded" : null,
      },
    ],
    paymentSummary: {
      accountEnding: accountLast4 ? `Account ending ${accountLast4}` : null,
      sortCodeMasked: maskSortCodeForDashboard(
        stringFromJson(certificateJson, "direct_debit_sort_code")
      ),
    },
    timeline: [
      {
        type: "Verification session created",
        at: certificate.verificationSession.createdAt.toISOString(),
      },
      ...certificate.verificationSession.consentEvents.map((event) => ({
        type: event.eventType,
        at: event.createdAt.toISOString(),
      })),
      ...(certificate.verificationSession.completedAt
        ? [
            {
              type: "Verification completed",
              at: certificate.verificationSession.completedAt.toISOString(),
            },
          ]
        : []),
      ...(certificate.verificationSession.declinedAt
        ? [
            {
              type: "Verification declined",
              at: certificate.verificationSession.declinedAt.toISOString(),
            },
          ]
        : []),
      {
        type: "Certificate created",
        at: certificate.createdAt.toISOString(),
      },
    ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)),
  };
}

export async function getDashboardCertificateDetail(
  context: OrganizationContext,
  certificateId: string,
  prisma: DashboardCertificateDetailDb = db
): Promise<DashboardCertificateDetail> {
  const normalizedId = certificateId.trim();

  if (!context.organization.id || !normalizedId) {
    throw new DashboardCertificateDetailNotFoundError();
  }

  const certificate = await prisma.certificate.findFirst({
    where: {
      id: normalizedId,
      verificationSession: {
        sale: {
          client: {
            organizationId: context.organization.id,
          },
        },
      },
    },
    select: {
      id: true,
      proofHash: true,
      createdAt: true,
      certificateJson: true,
      verificationSession: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          completedAt: true,
          declinedAt: true,
          consentEvents: {
            orderBy: { createdAt: "asc" },
            select: {
              eventType: true,
              createdAt: true,
            },
          },
          sale: {
            select: {
              id: true,
              clientReference: true,
              productName: true,
              productPrice: true,
              productFrequency: true,
              productTerms: true,
              productPolicies: true,
              coolingOffDays: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!certificate) {
    throw new DashboardCertificateDetailNotFoundError();
  }

  return buildCertificateDetailViewModel(certificate);
}
