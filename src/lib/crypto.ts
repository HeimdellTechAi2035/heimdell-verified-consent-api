// Phase 13 - production security foundation cryptographic utilities

import bcrypt from "bcryptjs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { nanoid } from "nanoid";

const BCRYPT_ROUNDS = 12;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_AUTH_TAG_BYTES = 16;
const ENCRYPTION_FORMAT_VERSION = "v1";

/**
 * Hash a value using bcrypt.
 * Suitable for API keys (compareHash required to verify - non-deterministic).
 */
export async function hashValue(value: string): Promise<string> {
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text value against a stored bcrypt hash.
 */
export async function compareHash(
  value: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

/**
 * Hash a token using SHA-256 for deterministic, indexed storage.
 * Use this for verification session tokens - bcrypt is non-deterministic
 * (salted) and cannot be used for database lookups.
 * The raw token is long and random (nanoid 32), so SHA-256 is safe here.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a cryptographically secure URL-safe token using nanoid.
 * Used for verification session tokens sent to customers.
 */
export function generateSecureToken(): string {
  return nanoid(32);
}

/**
 * Mask an account number, showing only the last 4 digits.
 * e.g. "12345678" -> "****5678"
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `****${last4}`;
}

/**
 * Mask a UK sort code, showing only the last 2 digits.
 * e.g. "12-34-56" -> "**-**-56"
 */
export function maskSortCode(sortCode: string): string {
  const digits = sortCode.replace(/\D/g, "");
  const last2 = digits.slice(-2);
  return `**-**-${last2}`;
}

export class EncryptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionConfigurationError";
  }
}

export function parseEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new EncryptionConfigurationError(
      "ENCRYPTION_KEY is required and must be a base64-encoded 32-byte key. Generate one with npm run generate:encryption-key."
    );
  }

  const trimmed = value.trim();
  let key: Buffer;
  try {
    key = Buffer.from(trimmed, "base64");
  } catch {
    throw new EncryptionConfigurationError(
      "ENCRYPTION_KEY must be valid base64 and decode to exactly 32 bytes."
    );
  }

  const canonicalInput = trimmed.replace(/=+$/u, "");
  const canonicalKey = key.toString("base64").replace(/=+$/u, "");
  if (key.length !== 32 || canonicalInput !== canonicalKey) {
    throw new EncryptionConfigurationError(
      "ENCRYPTION_KEY must be valid base64 and decode to exactly 32 bytes."
    );
  }

  return key;
}

function getEncryptionKey(): Buffer {
  return parseEncryptionKey(process.env.ENCRYPTION_KEY);
}

/**
 * Encrypt a sensitive value with AES-256-GCM.
 *
 * Stored format:
 *   v1:<iv_base64>:<auth_tag_base64>:<ciphertext_base64>
 */
export function encryptSensitiveValue(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
  });

  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by encryptSensitiveValue.
 */
export function decryptSensitiveValue(value: string): string {
  const [version, ivBase64, authTagBase64, ciphertextBase64] =
    value.split(":");

  if (
    version !== ENCRYPTION_FORMAT_VERSION ||
    !ivBase64 ||
    !authTagBase64 ||
    !ciphertextBase64
  ) {
    throw new Error(
      "Encrypted value has an unsupported format. Existing development data encrypted with the old base64 placeholder must be reset."
    );
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");

  if (
    iv.length !== ENCRYPTION_IV_BYTES ||
    authTag.length !== ENCRYPTION_AUTH_TAG_BYTES
  ) {
    throw new Error("Encrypted value has invalid AES-GCM metadata.");
  }

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
