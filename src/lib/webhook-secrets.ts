import { createHash } from "crypto";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  EncryptionConfigurationError,
} from "@/lib/crypto";

const WEBHOOK_SECRET_PREFIX = "whsec_";

export class WebhookSecretDecryptionError extends Error {
  constructor() {
    super("Webhook secret could not be decrypted.");
    this.name = "WebhookSecretDecryptionError";
  }
}

export function encryptWebhookSecret(secret: string): string {
  return encryptSensitiveValue(secret);
}

export function isEncryptedWebhookSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("v1:"));
}

export function decryptWebhookSecret(
  storedSecret: string | null | undefined
): string | null {
  if (!storedSecret) {
    return null;
  }

  if (!isEncryptedWebhookSecret(storedSecret)) {
    return storedSecret;
  }

  try {
    return decryptSensitiveValue(storedSecret);
  } catch (error) {
    if (error instanceof EncryptionConfigurationError) {
      throw error;
    }
    throw new WebhookSecretDecryptionError();
  }
}

export function getWebhookSecretFingerprint(
  storedSecret: string | null | undefined
): string | null {
  const secret = decryptWebhookSecret(storedSecret);

  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function maskWebhookSecretForDisplay(
  storedSecret: string | null | undefined
): string | null {
  const fingerprint = getWebhookSecretFingerprint(storedSecret);

  return fingerprint ? `${WEBHOOK_SECRET_PREFIX}...${fingerprint}` : null;
}

