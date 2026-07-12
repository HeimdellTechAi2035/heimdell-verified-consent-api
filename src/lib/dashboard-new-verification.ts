import { z } from "zod";
import type { VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { OrganizationContext } from "@/lib/dashboard-auth";
import {
  EncryptionConfigurationError,
  encryptSensitiveValue,
  generateSecureToken,
  hashToken,
  maskAccountNumber,
} from "@/lib/crypto";
import { sendVerificationLinkNotification } from "@/lib/notifications";
import { buildPolicySnapshotForClient } from "@/lib/client-policy";
import { chargeCreditsForVerification, InsufficientCreditsError } from "@/lib/credit-ledger";
import { creditCostForMethod } from "@/lib/credit-pricing";
import type { VerificationMethod } from "@prisma/client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const VERIFICATION_EXPIRY_MINUTES = 30;

const SALES_CHANNELS = [
  "door_to_door",
  "phone",
  "in_store",
  "online",
  "field_sales",
  "other",
] as const;

const optionalEmailSchema = z.preprocess(
  (value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized ? normalized : undefined;
  },
  z.string().email("Enter a valid customer email.").optional()
);

const digitsOnly = (value: unknown) => String(value ?? "").replace(/[\s-]/g, "");

/** Loose E.164-ish check — Twilio Voice needs a real dialable number. */
const PHONE_CALL_CAPABLE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export const dashboardVerificationSchema = z.object({
  sellerUserId: z
    .preprocess(
      (value) => {
        const normalized = String(value ?? "").trim();
        return normalized ? normalized : undefined;
      },
      z.string().optional()
    )
    .optional(),
  customerFullName: z.string().trim().min(1, "Customer full name is required."),
  customerPhone: z.string().trim().min(1, "Customer phone is required."),
  customerEmail: optionalEmailSchema,
  customerAddress: z.string().trim().min(1, "Customer address is required."),
  productName: z.string().trim().min(1, "Product name is required."),
  subscriptionPrice: z
    .string()
    .trim()
    .min(1, "Subscription price is required.")
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
      message: "Subscription price must be a positive number.",
    }),
  subscriptionFrequency: z
    .string()
    .trim()
    .min(1, "Subscription frequency is required."),
  contractLength: z
    .preprocess(
      (value) => {
        const normalized = String(value ?? "").trim();
        return normalized ? normalized : undefined;
      },
      z.string().optional()
    )
    .optional(),
  subscriptionTermsSummary: z
    .string()
    .trim()
    .min(1, "Subscription terms summary is required."),
  policiesSummary: z.string().trim().min(1, "Policies summary is required."),
  salesChannel: z.enum(SALES_CHANNELS),
  bankName: z.string().trim().min(1, "Bank name is required."),
  sortCode: z
    .preprocess(digitsOnly, z.string())
    .refine((value) => /^\d{6}$/.test(value), {
      message: "Sort code must be exactly 6 digits.",
    }),
  accountNumber: z
    .preprocess(digitsOnly, z.string())
    .refine((value) => /^\d{8}$/.test(value), {
      message: "Account number must be exactly 8 digits.",
    }),
  accountHolderName: z
    .string()
    .trim()
    .min(1, "Account holder name is required."),
  coolingOffDays: z.coerce
    .number()
    .int()
    .min(1, "Cooling-off days must be at least 1.")
    .max(365, "Cooling-off days must be 365 or fewer.")
    .default(14),
  aiMarketingOptIn: z.preprocess((value) => value === "on", z.boolean()),
  verificationMethod: z.enum(["link", "phone_call"]).default("link"),
}).superRefine((data, ctx) => {
  if (data.verificationMethod === "phone_call" && !PHONE_CALL_CAPABLE_PATTERN.test(data.customerPhone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customerPhone"],
      message: "Enter a valid dialable phone number to use phone-call verification.",
    });
  }
});

export type DashboardVerificationInput = z.infer<
  typeof dashboardVerificationSchema
>;

export type DashboardSellerOption = {
  id: string;
  name: string | null;
  email: string;
};

export type CreatedDashboardVerification = {
  saleId: string;
  verificationSessionId: string;
  status: VerificationStatus;
  expiresAt: string;
  verificationUrl: string;
  customerName: string;
  productName: string;
  verificationMethod: "link" | "phone_call";
};

export type DashboardNewVerificationResult =
  | {
      status: "success";
      message: string;
      createdVerification: CreatedDashboardVerification;
    }
  | {
      status: "error";
      message: string;
      createdVerification: null;
    };

export type DashboardNewVerificationState =
  | DashboardNewVerificationResult
  | {
      status: "idle";
      message: null;
      createdVerification: null;
    };

export function parseDashboardVerificationFormData(formData: FormData) {
  return dashboardVerificationSchema.safeParse({
    sellerUserId: formData.get("sellerUserId"),
    customerFullName: formData.get("customerFullName"),
    customerPhone: formData.get("customerPhone"),
    customerEmail: formData.get("customerEmail"),
    customerAddress: formData.get("customerAddress"),
    productName: formData.get("productName"),
    subscriptionPrice: formData.get("subscriptionPrice"),
    subscriptionFrequency: formData.get("subscriptionFrequency"),
    contractLength: formData.get("contractLength"),
    subscriptionTermsSummary: formData.get("subscriptionTermsSummary"),
    policiesSummary: formData.get("policiesSummary"),
    salesChannel: formData.get("salesChannel"),
    bankName: formData.get("bankName"),
    sortCode: formData.get("sortCode"),
    accountNumber: formData.get("accountNumber"),
    accountHolderName: formData.get("accountHolderName"),
    coolingOffDays: formData.get("coolingOffDays") || "14",
    aiMarketingOptIn: formData.get("aiMarketingOptIn"),
    verificationMethod: formData.get("verificationMethod") || "link",
  });
}

export async function getOrganizationSellerOptions(params: {
  organizationId: string;
}): Promise<DashboardSellerOption[]> {
  const memberships = await db.organizationMembership.findMany({
    where: {
      organizationId: params.organizationId,
      role: "SELLER",
    },
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return memberships.map((membership) => membership.user);
}

async function findActiveClientForOrganization(organizationId: string) {
  return db.client.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      organization: {
        archivedAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      webhookUrl: true,
      webhookSecret: true,
    },
  });
}

async function assertSellerInOrganization(params: {
  organizationId: string;
  sellerUserId: string;
}) {
  const membership = await db.organizationMembership.findFirst({
    where: {
      organizationId: params.organizationId,
      userId: params.sellerUserId,
      role: "SELLER",
    },
    select: { userId: true },
  });

  if (!membership) {
    throw new Error("Selected seller is not available for this organization.");
  }
}

function buildTermsSummary(input: DashboardVerificationInput): string {
  if (!input.contractLength) {
    return input.subscriptionTermsSummary;
  }

  return `Contract length: ${input.contractLength}\n\n${input.subscriptionTermsSummary}`;
}

function humanizeValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the required fields and try again.";
}

export async function createDashboardVerification(params: {
  context: OrganizationContext;
  input: DashboardVerificationInput;
  submittedByUserId: string | null;
}): Promise<CreatedDashboardVerification> {
  const { context, input } = params;

  if (context.organization.archivedAt) {
    throw new Error("This organization is archived and cannot create verifications.");
  }

  const client = await findActiveClientForOrganization(context.organization.id);
  if (!client) {
    throw new Error(
      "No active client is configured for this organization. Ask a platform admin to finish client setup."
    );
  }

  if (params.submittedByUserId) {
    await assertSellerInOrganization({
      organizationId: context.organization.id,
      sellerUserId: params.submittedByUserId,
    });
  }

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000
  );
  const accountNumberLast4 = maskAccountNumber(input.accountNumber).slice(-4);
  let encryptedAccountNumber: string;

  try {
    encryptedAccountNumber = encryptSensitiveValue(input.accountNumber);
  } catch (error) {
    if (error instanceof EncryptionConfigurationError) {
      throw new Error(
        "Server encryption is not configured correctly. Check ENCRYPTION_KEY."
      );
    }

    throw error;
  }

  const policySnapshot = await buildPolicySnapshotForClient({
    clientId: client.id,
    coolingOffDays: input.coolingOffDays,
  });

  const method: VerificationMethod =
    input.verificationMethod === "phone_call" ? "PHONE_CALL" : "LINK";

  const sale = await db.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        clientId: client.id,
        submittedByUserId: params.submittedByUserId,
        customerName: input.customerFullName,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        productName: input.productName,
        productPrice: Number(input.subscriptionPrice),
        productFrequency: input.subscriptionFrequency,
        productTerms: buildTermsSummary(input),
        productPolicies: input.policiesSummary,
        salesChannel: input.salesChannel,
        aiMarketingOptIn: input.aiMarketingOptIn,
        coolingOffDays: input.coolingOffDays,
        policySnapshot,
        directDebitMandate: {
          create: {
            bankName: input.bankName,
            sortCode: input.sortCode,
            accountNumberLast4,
            encryptedAccountNumber,
            accountHolderName: input.accountHolderName,
          },
        },
        verificationSessions: {
          create: {
            tokenHash,
            expiresAt,
            method,
          },
        },
      },
      include: {
        verificationSessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    const createdSession = created.verificationSessions[0];
    if (!createdSession) {
      throw new Error("Verification session could not be created.");
    }

    await chargeCreditsForVerification(tx, {
      organizationId: context.organization.id,
      cost: creditCostForMethod(input.verificationMethod),
      saleId: created.id,
      verificationSessionId: createdSession.id,
    });

    return created;
  });

  const session = sale.verificationSessions[0];
  if (!session) {
    throw new Error("Verification session could not be created.");
  }

  const verificationUrl = `${APP_URL}/v/${token}`;

  // Awaited deliberately -- see src/app/api/v1/sales/intake/route.ts for why
  // an un-awaited call here risks being killed mid-flight on serverless
  // before the phone call/SMS/email ever reaches the provider. This is
  // exactly the bug that caused a "Phone call" verification created from
  // this form to never actually ring the customer.
  await sendVerificationLinkNotification({
    saleId: sale.id,
    verificationSessionId: session.id,
    token,
    method,
    customerPhone: sale.customerPhone ?? null,
    customerEmail: sale.customerEmail ?? null,
    verificationUrl,
    clientWebhookUrl: client.webhookUrl ?? null,
    webhookSecret: client.webhookSecret ?? null,
  }).catch((error) => {
    console.error("[dashboard-new-verification] notification queue failed", {
      saleId: sale.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  });

  return {
    saleId: sale.id,
    verificationSessionId: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    verificationUrl,
    customerName: sale.customerName,
    productName: sale.productName,
    verificationMethod: input.verificationMethod,
  };
}

export async function createDashboardVerificationFromForm(params: {
  context: OrganizationContext;
  formData: FormData;
  submittedByUserId?: string | null;
}): Promise<DashboardNewVerificationResult> {
  const parsed = parseDashboardVerificationFormData(params.formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: humanizeValidationError(parsed.error),
      createdVerification: null,
    };
  }

  try {
    const createdVerification = await createDashboardVerification({
      context: params.context,
      input: parsed.data,
      submittedByUserId:
        params.submittedByUserId === undefined
          ? parsed.data.sellerUserId ?? null
          : params.submittedByUserId,
    });

    return {
      status: "success",
      message: "Verification created.",
      createdVerification,
    };
  } catch (error) {
    console.error("[dashboard-new-verification] create failed", {
      organizationId: params.context.organization.id,
      userId: params.context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    if (error instanceof InsufficientCreditsError) {
      return {
        status: "error",
        message:
          "Your organization doesn't have enough credits for a new verification. Buy more credits from the Credits page.",
        createdVerification: null,
      };
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Verification could not be created.",
      createdVerification: null,
    };
  }
}
