"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestIpFromHeaders } from "@/lib/request-ip";
import { checkRateLimitShared, logRateLimitEvent, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import {
  buildOrganizationSignupInput,
  checkOrganizationSignupAvailability,
  createOrganizationSignup,
  validateOrganizationSignupInput,
} from "@/lib/organization-signup";

export async function submitOrganizationSignup(formData: FormData) {
  const requestHeaders = await headers();
  const ip = getRequestIpFromHeaders(requestHeaders);

  const rateLimitResult = await checkRateLimitShared(RATE_LIMIT_POLICIES.publicSignupSubmit, [
    "signup",
    ip,
  ]);

  if (!rateLimitResult.allowed) {
    logRateLimitEvent({
      policy: RATE_LIMIT_POLICIES.publicSignupSubmit,
      route: "POST /signup",
      ip,
      key: rateLimitResult.key,
    });
    redirect("/signup?error=rate-limited");
  }

  const input = buildOrganizationSignupInput(formData);
  const validationErrors = validateOrganizationSignupInput(input);

  if (validationErrors.length > 0) {
    redirect("/signup?error=invalid-input");
  }

  const availability = await checkOrganizationSignupAvailability(input);
  if (availability.status === "blocked_active_membership") {
    redirect("/signup?error=email-in-use");
  }

  try {
    await createOrganizationSignup(input);
  } catch (error) {
    console.error("[signup] submission failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect("/signup?error=submission-failed");
  }

  redirect("/signup?submitted=1");
}
