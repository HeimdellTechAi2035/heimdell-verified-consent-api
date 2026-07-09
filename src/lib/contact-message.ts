// Public "contact us" form on the marketing site. Deliberately simple --
// no database table, just validate and forward straight to the inbox that
// reviews new business enquiries. If a persisted/dashboard-visible record of
// enquiries is ever needed, that's an easy additive follow-up.

import { sendEmailNotification } from "@/lib/notification-providers";

const CONTACT_RECIPIENT = "andrew@heimdell-tech-ai.co.uk";

export type ContactMessageInput = {
  name: string;
  email: string;
  companyName?: string;
  message: string;
};

export function buildContactMessageInput(formData: FormData): ContactMessageInput {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    companyName: String(formData.get("companyName") ?? "").trim() || undefined,
    message: String(formData.get("message") ?? "").trim(),
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateContactMessageInput(input: ContactMessageInput): string[] {
  const errors: string[] = [];

  if (!input.name) {
    errors.push("Enter your name.");
  }

  if (!isValidEmail(input.email)) {
    errors.push("Enter a valid email address.");
  }

  if (!input.message || input.message.length < 10) {
    errors.push("Enter a message (at least 10 characters).");
  }

  if (input.message && input.message.length > 4000) {
    errors.push("Message is too long.");
  }

  return errors;
}

export async function sendContactMessage(input: ContactMessageInput): Promise<boolean> {
  const bodyLines = [
    `New contact form submission from telecomcompliance.uk`,
    ``,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.companyName ? `Company: ${input.companyName}` : null,
    ``,
    `Message:`,
    input.message,
  ].filter((line): line is string => line !== null);

  const result = await sendEmailNotification({
    recipient: CONTACT_RECIPIENT,
    subject: `New enquiry from ${input.name}`,
    body: bodyLines.join("\n"),
  });

  return result.status === "sent";
}
