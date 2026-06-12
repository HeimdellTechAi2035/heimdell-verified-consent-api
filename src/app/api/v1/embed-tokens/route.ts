import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { createEmbedToken, EmbedTokenError } from "@/lib/embed-token";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

const embedTokenRequestSchema = z.object({
  type: z.enum(["verification_status", "deal_status", "verification_create"]),
  target: z.string().min(1).max(160),
});

function saleScopeWhere(params: {
  organizationId: string | null;
  clientId: string | null;
}) {
  return {
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.organizationId
      ? {
          client: {
            organizationId: params.organizationId,
          },
        }
      : {}),
  };
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const preAuthLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyPreAuth,
    route: "POST /api/v1/embed-tokens",
    identifiers: [apiKey ? safeFingerprint(apiKey, 16) : "missing-api-key"],
  });
  if (preAuthLimited) return preAuthLimited;

  if (!apiKey) {
    return errors.unauthorized("x-api-key header is required");
  }

  const auth = await authenticateApiKey(apiKey);
  if (!auth) {
    return errors.unauthorized("Invalid, revoked, or expired API key");
  }

  const authLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyAuthenticated,
    route: "POST /api/v1/embed-tokens:authenticated",
    identifiers: [auth.clientId ?? auth.organizationId ?? "api-key"],
  });
  if (authLimited) return authLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errors.badRequest("Request body must be valid JSON");
  }

  const parsed = embedTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errors.badRequest("Invalid request payload", parsed.error.flatten());
  }

  const { type, target } = parsed.data;

  if (!auth.organizationId && !auth.clientId) {
    return errors.forbidden("API key has no tenant scope for embed tokens");
  }

  const scopedSaleWhere = saleScopeWhere({
    organizationId: auth.organizationId,
    clientId: auth.clientId,
  });

  const exists =
    type === "verification_create"
      ? await db.client.findFirst({
          where: {
            id: target,
            status: "ACTIVE",
            ...(auth.clientId ? { id: auth.clientId } : {}),
            ...(auth.organizationId ? { organizationId: auth.organizationId } : {}),
          },
          select: { id: true },
        })
      : type === "verification_status"
      ? await db.verificationSession.findFirst({
          where: {
            id: target,
            sale: scopedSaleWhere,
          },
          select: { id: true },
        })
      : await db.sale.findFirst({
          where: {
            clientReference: target,
            ...scopedSaleWhere,
          },
          select: { id: true },
        });

  if (!exists) {
    return errors.notFound("Embed target not found");
  }

  try {
    const token = createEmbedToken({
      scope: type,
      organizationId: auth.organizationId ?? auth.client?.organizationId ?? "",
      clientId: auth.clientId,
      targetId: target,
      ttlSeconds: 10 * 60,
    });

    return NextResponse.json({
      ok: true,
      token: token.token,
      expiresAt: token.expiresAt,
      tokenType: "Bearer",
    });
  } catch (error) {
    if (error instanceof EmbedTokenError) {
      console.error("[embed-tokens] token secret is not configured");
      return errors.internal("Embed token signing is not configured.");
    }

    throw error;
  }
}
