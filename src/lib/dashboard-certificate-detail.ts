import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import { createProofHashFingerprint } from "@/lib/dashboard-certificates";
import {
  resolveSalePolicySnapshot,
  type CompliancePolicySnapshot,
} from "@/lib/client-policy";
import {
  humanizeConsentEventType,
  normalizeSaleTermsForEvidence,
} from "@/lib/sale-evidence-display";

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
    clientCompanyName: string;
    clientReference: string;
    status: string;
    sellerName: string | null;
    sellerEmail: string | null;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    customerAddress: string | null;
    productName: string;
    subscriptionPrice: string;
    subscriptionFrequency: string | null;
    contractLength: string | null;
    salesChannel: string | null;
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
    verificationMethod: string | null;
    customerIpAddress: string | null;
    customerUserAgent: string | null;
    callSid: string | null;
  };
  policy: CompliancePolicySnapshot & {
    isLegacyFallback: boolean;
  };
  confirmations: Array<{
    label: string;
    value: boolean | string | null;
  }>;
  paymentSummary: {
    bankName: string | null;
    accountEnding: string | null;
    sortCodeMasked: string | null;
    accountHolderName: string | null;
  };
  policyVersion: string | null;
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
      policySnapshot: Prisma.JsonValue | null;
      salesChannel: string | null;
      coolingOffDays: number | null;
      status: string;
      customerName: string;
      customerPhone: string | null;
      customerEmail: string | null;
      customerAddress: string | null;
      client: {
        name: string;
      };
      submittedByUser: {
        name: string | null;
        email: string;
      } | null;
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
  const policySnapshot =
    sale.policySnapshot &&
    typeof sale.policySnapshot === "object" &&
    !Array.isArray(sale.policySnapshot)
      ? (sale.policySnapshot as Record<string, unknown>)
      : {};
  const resolvedPolicy = resolveSalePolicySnapshot({
    policySnapshot: sale.policySnapshot,
    productTerms: sale.productTerms,
    productPolicies: sale.productPolicies,
    coolingOffDays: sale.coolingOffDays,
  });
  const isLegacyFallback = Object.keys(policySnapshot).length === 0;
  const policyVersion = resolvedPolicy.policyVersion;
  const termsEvidence = normalizeSaleTermsForEvidence(
    sale.productTerms ?? stringFromJson(certificateJson, "terms_summary")
  );

  return {
    id: certificate.id,
    proofHash: certificate.proofHash,
    proofHashFingerprint: createProofHashFingerprint(certificate.proofHash),
    certificateVersion: stringFromJson(certificateJson, "_version"),
    createdAt: certificate.createdAt.toISOString(),
    sale: {
      id: sale.id,
      clientCompanyName: sale.client.name,
      clientReference: sale.clientReference ?? "Unreferenced sale",
      status: sale.status,
      sellerName: sale.submittedByUser?.name ?? null,
      sellerEmail: sale.submittedByUser?.email ?? null,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      customerEmail: sale.customerEmail,
      customerAddress: sale.customerAddress,
      productName: sale.productName,
      subscriptionPrice: price,
      subscriptionFrequency: sale.productFrequency,
      contractLength: termsEvidence.contractLength,
      salesChannel:
        sale.salesChannel ?? stringFromJson(certificateJson, "sales_channel"),
      priceSummary: `${price}${frequency}`,
      termsSummary: termsEvidence.termsSummary,
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
      verificationMethod: stringFromJson(certificateJson, "verification_method"),
      customerIpAddress: stringFromJson(certificateJson, "ip_address"),
      customerUserAgent: stringFromJson(certificateJson, "user_agent"),
      callSid: stringFromJson(certificateJson, "call_sid"),
    },
    policy: {
      ...resolvedPolicy,
      isLegacyFallback,
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
      stringFromJson(certificateJson, "verification_method") === "phone_call"
        ? {
            label: "Confirmed via phone call",
            value: stringFromJson(certificateJson, "digits_pressed") === "1"
              ? `Pressed 1 to agree (call ${stringFromJson(certificateJson, "call_sid") ?? "unknown"})`
              : stringFromJson(certificateJson, "digits_pressed"),
          }
        : {
            label: "Typed name confirmation",
            value: stringFromJson(certificateJson, "typed_name"),
          },
    ],
    paymentSummary: {
      bankName: stringFromJson(certificateJson, "direct_debit_bank_name"),
      accountEnding: accountLast4 ? `Account ending ${accountLast4}` : null,
      sortCodeMasked: maskSortCodeForDashboard(
        stringFromJson(certificateJson, "direct_debit_sort_code")
      ),
      accountHolderName: stringFromJson(
        certificateJson,
        "direct_debit_account_holder"
      ),
    },
    policyVersion,
    timeline: [
      {
        type: "Verification session created",
        at: certificate.verificationSession.createdAt.toISOString(),
      },
      ...certificate.verificationSession.consentEvents.map((event) => ({
        type: humanizeConsentEventType(event.eventType),
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
          ...(context.membership.role === "SELLER"
            ? { submittedByUserId: context.user.id }
            : {}),
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
              customerName: true,
              customerPhone: true,
              customerEmail: true,
              customerAddress: true,
              productName: true,
              productPrice: true,
              productFrequency: true,
              productTerms: true,
              productPolicies: true,
              policySnapshot: true,
              salesChannel: true,
              coolingOffDays: true,
              status: true,
              client: {
                select: { name: true },
              },
              submittedByUser: {
                select: {
                  name: true,
                  email: true,
                },
              },
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
