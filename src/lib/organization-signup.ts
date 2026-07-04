// Public self-serve organization signup. Deliberately kept separate from
// dashboard-client-provisioning.ts (staff/admin-only, gated code) -- this
// file is the unauthenticated public-write surface, and mixing the two is a
// readability/security-review smell.
//
// Submissions here only ever create a PENDING_APPROVAL Organization row --
// no Client, User, or OrganizationMembership is created until a Platform
// Admin approves (see approveOrganizationSignup in
// dashboard-client-provisioning.ts). Companies House/ICO numbers are
// collected for a human to eyeball, NOT verified against any real register.

import { db } from "@/lib/db";
import { normalizeSlug, getClientAdminAvailability } from "@/lib/dashboard-client-provisioning";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";

export type OrganizationSignupInput = {
  organizationName: string;
  companiesHouseNumber: string;
  icoRegistrationNumber: string;
  businessAddress: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
};

export function buildOrganizationSignupInput(formData: FormData): OrganizationSignupInput {
  return {
    organizationName: String(formData.get("organizationName") ?? "").trim(),
    companiesHouseNumber: String(formData.get("companiesHouseNumber") ?? "").trim(),
    icoRegistrationNumber: String(formData.get("icoRegistrationNumber") ?? "").trim(),
    businessAddress: String(formData.get("businessAddress") ?? "").trim(),
    primaryContactName: String(formData.get("primaryContactName") ?? "").trim(),
    primaryContactEmail: String(formData.get("primaryContactEmail") ?? "").trim().toLowerCase(),
    primaryContactPhone: String(formData.get("primaryContactPhone") ?? "").trim() || undefined,
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Loose on purpose -- real Companies House numbers vary in shape (Scotland/
// NI/LLP use letter prefixes) and ICO numbers look like "ZA123456". A human
// reviews these; an overly strict pattern only risks rejecting legitimate
// applicants.
function isPlausibleRegistrationNumber(value: string): boolean {
  return /^[A-Za-z0-9 -]{4,20}$/.test(value);
}

export function validateOrganizationSignupInput(input: OrganizationSignupInput): string[] {
  const errors: string[] = [];

  if (!input.organizationName) {
    errors.push("Company name is required.");
  }

  if (!isPlausibleRegistrationNumber(input.companiesHouseNumber)) {
    errors.push("Enter a valid Companies House number.");
  }

  if (!isPlausibleRegistrationNumber(input.icoRegistrationNumber)) {
    errors.push("Enter a valid ICO registration number.");
  }

  if (!input.businessAddress) {
    errors.push("Business address is required.");
  }

  if (!input.primaryContactName) {
    errors.push("Contact name is required.");
  }

  if (!isValidEmail(input.primaryContactEmail)) {
    errors.push("Enter a valid email address.");
  }

  return errors;
}

/**
 * Generates a unique organization slug from the company name, retrying with
 * a numeric suffix on collision. Uniqueness is checked against ALL
 * organizations regardless of onboardingStatus, since slug is a single
 * global unique column.
 */
export async function generateAvailableOrganizationSlug(name: string): Promise<string> {
  const base = normalizeSlug(name) || "client";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await db.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  // Astronomically unlikely, but never loop forever.
  return `${base}-${Date.now()}`;
}

export type OrganizationSignupAvailability =
  | { status: "available" }
  | { status: "blocked_active_membership" };

export async function checkOrganizationSignupAvailability(
  input: OrganizationSignupInput
): Promise<OrganizationSignupAvailability> {
  const adminAvailability = await getClientAdminAvailability({
    clientAdminEmail: input.primaryContactEmail,
  });

  if (adminAvailability.status === "blocked_active_membership") {
    return { status: "blocked_active_membership" };
  }

  return { status: "available" };
}

export async function createOrganizationSignup(
  input: OrganizationSignupInput
): Promise<{ organizationId: string; slug: string }> {
  const slug = await generateAvailableOrganizationSlug(input.organizationName);

  const organization = await db.organization.create({
    data: {
      name: input.organizationName,
      slug,
      primaryContactName: input.primaryContactName,
      primaryContactEmail: input.primaryContactEmail,
      primaryContactPhone: input.primaryContactPhone,
      companiesHouseNumber: input.companiesHouseNumber,
      icoRegistrationNumber: input.icoRegistrationNumber,
      businessAddress: input.businessAddress,
      onboardingStatus: "PENDING_APPROVAL",
    },
    select: { id: true, slug: true },
  });

  await logDashboardAuditEvent({
    organizationId: organization.id,
    userId: null,
    action: "signup_submitted",
    entityType: "organization",
    entityId: organization.id,
  });

  return { organizationId: organization.id, slug: organization.slug };
}
