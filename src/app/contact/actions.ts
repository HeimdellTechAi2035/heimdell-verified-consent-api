"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestIpFromHeaders } from "@/lib/request-ip";
import { checkRateLimitShared, logRateLimitEvent, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import {
  buildContactMessageInput,
  sendContactMessage,
  validateContactMessageInput,
} from "@/lib/contact-message";

export async function submitContactMessage(formData: FormData) {
  const requestHeaders = await headers();
  const ip = getRequestIpFromHeaders(requestHeaders);

  const rateLimitResult = await checkRateLimitShared(RATE_LIMIT_POLICIES.publicContactSubmit, [
    "contact",
    ip,
  ]);

  if (!rateLimitResult.allowed) {
    logRateLimitEvent({
      policy: RATE_LIMIT_POLICIES.publicContactSubmit,
      route: "POST /contact",
      ip,
      key: rateLimitResult.key,
    });
    redirect("/contact?error=rate-limited");
  }

  const input = buildContactMessageInput(formData);
  const validationErrors = validateContactMessageInput(input);

  if (validationErrors.length > 0) {
    redirect("/contact?error=invalid-input");
  }

  try {
    await sendContactMessage(input);
  } catch (error) {
    console.error("[contact] submission failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect("/contact?error=submission-failed");
  }

  redirect("/contact?submitted=1");
}
