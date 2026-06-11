// Phase 2 — Zod validation schemas with normalization

import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip spaces and hyphens — used to normalise sort codes and account numbers. */
const normaliseDigitsOnly = (v: string) => v.replace(/[\s-]/g, "");

// ---------------------------------------------------------------------------
// Sale intake schema
// Matches the POST /api/v1/sales/intake payload shape.
// Transforms normalise fields so the parsed output is already clean.
// ---------------------------------------------------------------------------

export const saleIntakeSchema = z.object({
  client_reference: z.string().min(1, "client_reference is required"),
  agent_id: z.string().optional(),
  seller_email: z.preprocess(
    (v) => (!v || v === "" ? undefined : String(v).trim().toLowerCase()),
    z.string().email("seller_email must be a valid email if provided").optional()
  ),

  customer: z.object({
    full_name: z.string().min(1, "customer.full_name is required"),

    phone: z
      .string()
      .min(1, "customer.phone is required")
      .transform((v) => v.trim()),

    // Optional but must be a valid email when supplied.
    // Empty string is treated the same as omitted.
    email: z.preprocess(
      (v) => (!v || v === "" ? undefined : v),
      z.string().email("customer.email must be a valid email if provided").optional()
    ),

    address: z.string().min(1, "customer.address is required"),
  }),

  product: z.object({
    name: z.string().min(1, "product.name is required"),

    subscription_price: z
      .string()
      .min(1, "product.subscription_price is required")
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        "product.subscription_price must be a positive number"
      ),

    subscription_frequency: z
      .string()
      .min(1, "product.subscription_frequency is required"),

    subscription_terms_summary: z
      .string()
      .min(1, "product.subscription_terms_summary is required"),

    policies_summary: z
      .string()
      .min(1, "product.policies_summary is required"),
  }),

  direct_debit: z
    .object({
      bank_name: z.string().min(1, "direct_debit.bank_name is required"),

      sort_code: z
        .string()
        .min(1, "direct_debit.sort_code is required")
        .transform(normaliseDigitsOnly),

      account_number: z
        .string()
        .min(1, "direct_debit.account_number is required")
        .transform(normaliseDigitsOnly),

      account_holder_name: z
        .string()
        .min(1, "direct_debit.account_holder_name is required"),
    })
    .superRefine((dd, ctx) => {
      if (!/^\d{6}$/.test(dd.sort_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sort_code"],
          message: "sort_code must be exactly 6 digits after normalisation (received: " + dd.sort_code.length + " digits)",
        });
      }
      if (!/^\d{8}$/.test(dd.account_number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["account_number"],
          message: "account_number must be exactly 8 digits after normalisation (received: " + dd.account_number.length + " digits)",
        });
      }
    }),

  sales_channel: z
    .enum(["door_to_door", "phone", "in_store", "online", "field_sales", "other"])
    .optional(),

  consent: z
    .object({
      ai_marketing_opt_in: z.boolean().optional(),
      cooling_off_days: z.number().int().min(1).max(365).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Verification schemas — to be expanded in Phase 3
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Verification schemas
// ---------------------------------------------------------------------------

/**
 * Body sent by the customer to POST /api/v1/verification-sessions/[token]/complete.
 * Every boolean field must be explicitly true — any false signals the customer
 * has not completed the full consent flow.
 */
export const completeVerificationSchema = z.object({
  confirm_details_correct: z.literal(true, {
    errorMap: () => ({ message: "You must confirm your details are correct" }),
  }),
  confirm_product_price_frequency: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm the product price and payment frequency",
    }),
  }),
  confirm_terms: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm you have read and agreed to the terms",
    }),
  }),
  confirm_policies: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm you have read the policies",
    }),
  }),
  confirm_cooling_off: z.literal(true, {
    errorMap: () => ({
      message:
        "You must confirm you understand the cooling-off period",
    }),
  }),
  authorise_direct_debit: z.literal(true, {
    errorMap: () => ({ message: "You must authorise the Direct Debit" }),
  }),
  confirm_evidence_storage: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm consent to evidence storage",
    }),
  }),
  typed_name: z
    .string()
    .min(2, "typed_name must be at least 2 characters")
    .transform((v) => v.trim()),
  // Optional — only included when the sale had AI marketing opt-in/out recorded.
  confirm_ai_consent: z.boolean().optional(),
});

export const declineVerificationSchema = z.object({
  reason: z
    .string()
    .min(3, "reason must be at least 3 characters")
    .max(500, "reason must be 500 characters or fewer"),
  details: z
    .string()
    .max(1000, "details must be 1000 characters or fewer")
    .optional(),
});
// ---------------------------------------------------------------------------

export type SaleIntakeInput = z.infer<typeof saleIntakeSchema>;
export type CompleteVerificationInput = z.infer<typeof completeVerificationSchema>;
export type DeclineVerificationInput = z.infer<typeof declineVerificationSchema>;

