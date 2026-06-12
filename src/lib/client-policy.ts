import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";

export type CompliancePolicySnapshot = {
  termsAndConditions: string;
  coolingOffPolicy: string;
  cancellationInstructions: string;
  privacyEvidenceWording: string;
  directDebitGuaranteeWording: string;
  policyVersion: string;
  capturedAt: string;
};

export type ClientPolicyViewModel = {
  clientId: string;
  clientName: string;
  termsAndConditions: string;
  coolingOffPolicy: string;
  cancellationInstructions: string;
  privacyEvidenceWording: string;
  directDebitGuaranteeWording: string;
  policyVersion: string;
  coolingOffDays: number;
  updatedAt: string | null;
};

export type PolicySettingsActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

const DEFAULT_POLICY_VERSION = "v1";
const DEFAULT_COOLING_OFF_DAYS = 14;

export const DEFAULT_TERMS_AND_CONDITIONS =
  "You are agreeing to the product, price, payment frequency, contract length, and service details shown on this page. The provider must deliver the service as described and may rely on this verification as evidence that you reviewed and accepted the sale details.";

export const DEFAULT_COOLING_OFF_POLICY =
  "You have a statutory cooling-off period during which you may cancel without penalty. Unless a different period is shown, this period is 14 days from the date you agree to the service or receive the required contract information, whichever applies under the sale circumstances.";

export const DEFAULT_CANCELLATION_INSTRUCTIONS =
  "To cancel, contact the provider using the customer support details supplied during the sale. Include your name, contact details, sale reference where available, and a clear statement that you wish to cancel.";

export const DEFAULT_PRIVACY_EVIDENCE_WORDING =
  "Heimdell records the verification details, consent confirmations, timestamps, IP address, browser information, and related sale data as evidence of your decision. This evidence is stored securely and used only for compliance, dispute resolution, audit, and lawful business purposes.";

export const DEFAULT_DIRECT_DEBIT_GUARANTEE_WORDING =
  "The Direct Debit Guarantee protects you if an error is made in the payment of your Direct Debit. You are entitled to a full and immediate refund from your bank or building society if an incorrect amount is taken or a payment is taken on the wrong date. You may cancel a Direct Debit at any time by contacting your bank or building society.";

const policySettingsSchema = z.object({
  clientId: z.string().min(1, "Select a client."),
  termsAndConditions: z
    .string()
    .trim()
    .min(20, "Terms and Conditions must be at least 20 characters."),
  coolingOffPolicy: z
    .string()
    .trim()
    .min(20, "Cooling-off Policy must be at least 20 characters."),
  cancellationInstructions: z
    .string()
    .trim()
    .min(20, "Cancellation Instructions must be at least 20 characters."),
  privacyEvidenceWording: z
    .string()
    .trim()
    .min(20, "Privacy and Evidence Storage wording must be at least 20 characters."),
  directDebitGuaranteeWording: z
    .string()
    .trim()
    .min(20, "Direct Debit Guarantee wording must be at least 20 characters."),
  policyVersion: z.string().trim().min(1, "Policy Version is required.").max(40),
});

type PolicySettingsInput = z.infer<typeof policySettingsSchema>;

function textOrDefault(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function versionOrDefault(value: string | null | undefined) {
  return value?.trim() ? value.trim() : DEFAULT_POLICY_VERSION;
}

function snapshotFromJson(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    termsAndConditions:
      typeof record.termsAndConditions === "string"
        ? record.termsAndConditions
        : DEFAULT_TERMS_AND_CONDITIONS,
    coolingOffPolicy:
      typeof record.coolingOffPolicy === "string"
        ? record.coolingOffPolicy
        : DEFAULT_COOLING_OFF_POLICY,
    cancellationInstructions:
      typeof record.cancellationInstructions === "string"
        ? record.cancellationInstructions
        : DEFAULT_CANCELLATION_INSTRUCTIONS,
    privacyEvidenceWording:
      typeof record.privacyEvidenceWording === "string"
        ? record.privacyEvidenceWording
        : DEFAULT_PRIVACY_EVIDENCE_WORDING,
    directDebitGuaranteeWording:
      typeof record.directDebitGuaranteeWording === "string"
        ? record.directDebitGuaranteeWording
        : DEFAULT_DIRECT_DEBIT_GUARANTEE_WORDING,
    policyVersion:
      typeof record.policyVersion === "string"
        ? record.policyVersion
        : DEFAULT_POLICY_VERSION,
    capturedAt:
      typeof record.capturedAt === "string"
        ? record.capturedAt
        : new Date(0).toISOString(),
  } satisfies CompliancePolicySnapshot;
}

export function buildDefaultPolicySnapshot(params?: {
  coolingOffDays?: number | null;
  capturedAt?: Date;
}): CompliancePolicySnapshot {
  const days = params?.coolingOffDays ?? DEFAULT_COOLING_OFF_DAYS;
  return {
    termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
    coolingOffPolicy: DEFAULT_COOLING_OFF_POLICY.replace("14 days", `${days} days`),
    cancellationInstructions: DEFAULT_CANCELLATION_INSTRUCTIONS,
    privacyEvidenceWording: DEFAULT_PRIVACY_EVIDENCE_WORDING,
    directDebitGuaranteeWording: DEFAULT_DIRECT_DEBIT_GUARANTEE_WORDING,
    policyVersion: DEFAULT_POLICY_VERSION,
    capturedAt: (params?.capturedAt ?? new Date()).toISOString(),
  };
}

export async function buildPolicySnapshotForClient(params: {
  clientId: string;
  coolingOffDays?: number | null;
  capturedAt?: Date;
}): Promise<CompliancePolicySnapshot> {
  const capturedAt = params.capturedAt ?? new Date();
  const policy = await db.clientPolicy.findUnique({
    where: { clientId: params.clientId },
    select: {
      coolingOffDays: true,
      coolingOffText: true,
      termsAndConditions: true,
      cancellationPolicy: true,
      privacyEvidenceWording: true,
      directDebitGuaranteeWording: true,
      policyVersion: true,
    },
  });
  const days =
    params.coolingOffDays ?? policy?.coolingOffDays ?? DEFAULT_COOLING_OFF_DAYS;

  if (!policy) {
    return buildDefaultPolicySnapshot({ coolingOffDays: days, capturedAt });
  }

  return {
    termsAndConditions: textOrDefault(
      policy.termsAndConditions,
      DEFAULT_TERMS_AND_CONDITIONS
    ),
    coolingOffPolicy: textOrDefault(
      policy.coolingOffText,
      DEFAULT_COOLING_OFF_POLICY.replace("14 days", `${days} days`)
    ),
    cancellationInstructions: textOrDefault(
      policy.cancellationPolicy,
      DEFAULT_CANCELLATION_INSTRUCTIONS
    ),
    privacyEvidenceWording: textOrDefault(
      policy.privacyEvidenceWording,
      DEFAULT_PRIVACY_EVIDENCE_WORDING
    ),
    directDebitGuaranteeWording: textOrDefault(
      policy.directDebitGuaranteeWording,
      DEFAULT_DIRECT_DEBIT_GUARANTEE_WORDING
    ),
    policyVersion: versionOrDefault(policy.policyVersion),
    capturedAt: capturedAt.toISOString(),
  };
}

export function resolveSalePolicySnapshot(params: {
  policySnapshot: Prisma.JsonValue | null;
  productTerms: string | null;
  productPolicies: string | null;
  coolingOffDays: number | null;
}): CompliancePolicySnapshot {
  const snapshot = snapshotFromJson(params.policySnapshot);
  if (snapshot) {
    return snapshot;
  }

  const fallback = buildDefaultPolicySnapshot({
    coolingOffDays: params.coolingOffDays,
    capturedAt: new Date(0),
  });

  return {
    ...fallback,
    termsAndConditions:
      params.productTerms?.trim() || fallback.termsAndConditions,
    coolingOffPolicy: fallback.coolingOffPolicy,
    cancellationInstructions:
      params.productPolicies?.trim() || fallback.cancellationInstructions,
  };
}

export async function getClientPolicySettings(
  context: OrganizationContext
): Promise<ClientPolicyViewModel[]> {
  const clients = await db.client.findMany({
    where: {
      organizationId: context.organization.id,
      status: "ACTIVE",
      organization: { archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      clientPolicy: {
        select: {
          coolingOffDays: true,
          coolingOffText: true,
          termsAndConditions: true,
          cancellationPolicy: true,
          privacyEvidenceWording: true,
          directDebitGuaranteeWording: true,
          policyVersion: true,
          updatedAt: true,
        },
      },
    },
  });

  return clients.map((client) => {
    const policy = client.clientPolicy;
    return {
      clientId: client.id,
      clientName: client.name,
      termsAndConditions: textOrDefault(
        policy?.termsAndConditions,
        DEFAULT_TERMS_AND_CONDITIONS
      ),
      coolingOffPolicy: textOrDefault(
        policy?.coolingOffText,
        DEFAULT_COOLING_OFF_POLICY.replace(
          "14 days",
          `${policy?.coolingOffDays ?? DEFAULT_COOLING_OFF_DAYS} days`
        )
      ),
      cancellationInstructions: textOrDefault(
        policy?.cancellationPolicy,
        DEFAULT_CANCELLATION_INSTRUCTIONS
      ),
      privacyEvidenceWording: textOrDefault(
        policy?.privacyEvidenceWording,
        DEFAULT_PRIVACY_EVIDENCE_WORDING
      ),
      directDebitGuaranteeWording: textOrDefault(
        policy?.directDebitGuaranteeWording,
        DEFAULT_DIRECT_DEBIT_GUARANTEE_WORDING
      ),
      policyVersion: versionOrDefault(policy?.policyVersion),
      coolingOffDays: policy?.coolingOffDays ?? DEFAULT_COOLING_OFF_DAYS,
      updatedAt: policy?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function saveClientPolicySettings(params: {
  context: OrganizationContext;
  formData: FormData;
}): Promise<PolicySettingsActionState> {
  const parsed = policySettingsSchema.safeParse({
    clientId: params.formData.get("clientId"),
    termsAndConditions: params.formData.get("termsAndConditions"),
    coolingOffPolicy: params.formData.get("coolingOffPolicy"),
    cancellationInstructions: params.formData.get("cancellationInstructions"),
    privacyEvidenceWording: params.formData.get("privacyEvidenceWording"),
    directDebitGuaranteeWording: params.formData.get("directDebitGuaranteeWording"),
    policyVersion: params.formData.get("policyVersion"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Check the policy wording and try again.",
    };
  }

  const input: PolicySettingsInput = parsed.data;
  const client = await db.client.findFirst({
    where: {
      id: input.clientId,
      organizationId: params.context.organization.id,
      status: "ACTIVE",
      organization: { archivedAt: null },
    },
    select: { id: true },
  });

  if (!client) {
    return {
      status: "error",
      message: "Selected client is not available for this organization.",
    };
  }

  await db.clientPolicy.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      termsAndConditions: input.termsAndConditions,
      coolingOffText: input.coolingOffPolicy,
      cancellationPolicy: input.cancellationInstructions,
      privacyEvidenceWording: input.privacyEvidenceWording,
      directDebitGuaranteeWording: input.directDebitGuaranteeWording,
      policyVersion: input.policyVersion,
    },
    update: {
      termsAndConditions: input.termsAndConditions,
      coolingOffText: input.coolingOffPolicy,
      cancellationPolicy: input.cancellationInstructions,
      privacyEvidenceWording: input.privacyEvidenceWording,
      directDebitGuaranteeWording: input.directDebitGuaranteeWording,
      policyVersion: input.policyVersion,
    },
    select: { id: true },
  });

  return {
    status: "success",
    message: "Compliance policy saved. New verifications will capture this wording as an immutable snapshot.",
  };
}
