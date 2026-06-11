import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type EmbedTokenScope = "verification_status" | "deal_status";

export type EmbedTokenClaims = {
  version: 1;
  scope: EmbedTokenScope;
  organizationId: string;
  clientId: string | null;
  targetId: string;
  expiresAt: number;
  issuedAt: number;
  jti: string;
};

export class EmbedTokenError extends Error {}

const MIN_SECRET_LENGTH = 32;

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function getEmbedTokenSecret(): string {
  const secret = process.env.EMBED_TOKEN_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new EmbedTokenError(
      "EMBED_TOKEN_SECRET must be set to at least 32 characters."
    );
  }

  return secret;
}

function validateEmbedTokenSecret(secret: string): string {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new EmbedTokenError(
      "EMBED_TOKEN_SECRET must be set to at least 32 characters."
    );
  }

  return secret;
}

function signPayload(payload: string, secret?: string): string {
  const signingSecret = secret
    ? validateEmbedTokenSecret(secret)
    : getEmbedTokenSecret();
  return createHmac("sha256", signingSecret)
    .update(payload)
    .digest("base64url");
}

export function createEmbedToken(params: {
  scope: EmbedTokenScope;
  organizationId: string;
  clientId?: string | null;
  targetId: string;
  ttlSeconds?: number;
  secret?: string;
}): { token: string; expiresAt: string; claims: EmbedTokenClaims } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = params.ttlSeconds ?? 10 * 60;
  const claims: EmbedTokenClaims = {
    version: 1,
    scope: params.scope,
    organizationId: params.organizationId,
    clientId: params.clientId ?? null,
    targetId: params.targetId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ttlSeconds,
    jti: randomBytes(16).toString("base64url"),
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload, params.secret);

  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    claims,
  };
}

export function verifyEmbedToken(params: {
  token: string;
  expectedScope: EmbedTokenScope;
  expectedTargetId: string;
  secret?: string;
  nowSeconds?: number;
}): EmbedTokenClaims {
  const [payload, signature, extra] = params.token.split(".");

  if (!payload || !signature || extra !== undefined) {
    throw new EmbedTokenError("Invalid embed token.");
  }

  const expectedSignature = signPayload(payload, params.secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new EmbedTokenError("Invalid embed token signature.");
  }

  let claims: EmbedTokenClaims;
  try {
    claims = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  } catch {
    throw new EmbedTokenError("Invalid embed token payload.");
  }

  if (claims.version !== 1) {
    throw new EmbedTokenError("Unsupported embed token version.");
  }

  if (claims.scope !== params.expectedScope) {
    throw new EmbedTokenError("Embed token scope mismatch.");
  }

  if (claims.targetId !== params.expectedTargetId) {
    throw new EmbedTokenError("Embed token target mismatch.");
  }

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.expiresAt <= nowSeconds) {
    throw new EmbedTokenError("Embed token has expired.");
  }

  if (!claims.organizationId || !claims.targetId || !claims.jti) {
    throw new EmbedTokenError("Embed token is missing required claims.");
  }

  return claims;
}

export function extractBearerEmbedToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const url = new URL(request.url);
  return url.searchParams.get("embedToken");
}
