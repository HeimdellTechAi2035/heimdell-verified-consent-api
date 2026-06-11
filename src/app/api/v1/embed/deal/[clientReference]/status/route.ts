import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import {
  EmbedTokenError,
  extractBearerEmbedToken,
  verifyEmbedToken,
} from "@/lib/embed-token";
import { isAllowedEmbedRequestOrigin } from "@/lib/embed-origin";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

type Params = { params: Promise<{ clientReference: string }> };

export async function GET(request: Request, { params }: Params) {
  const { clientReference } = await params;
  const token = extractBearerEmbedToken(request);
  const limited = await enforceRateLimit({
    req: request,
    policy: RATE_LIMIT_POLICIES.embedStatus,
    route: "GET /api/v1/embed/deal/[clientReference]/status",
    identifiers: [
      safeFingerprint(clientReference, 16),
      token ? safeFingerprint(token, 16) : "missing-embed-token",
    ],
  });
  if (limited) return limited;

  if (!isAllowedEmbedRequestOrigin(request)) {
    return errors.forbidden("Embed origin is not allowed");
  }

  if (!token) {
    return errors.unauthorized("Signed embed token is required");
  }

  let claims;
  try {
    claims = verifyEmbedToken({
      token,
      expectedScope: "deal_status",
      expectedTargetId: clientReference,
    });
  } catch (error) {
    if (error instanceof EmbedTokenError) {
      return errors.unauthorized("Invalid or expired embed token");
    }
    throw error;
  }

  const sale = await db.sale.findFirst({
    where: {
      clientReference,
      ...(claims.clientId ? { clientId: claims.clientId } : {}),
      client: {
        organizationId: claims.organizationId,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientReference: true,
      productName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      verificationSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          completedAt: true,
          declinedAt: true,
          certificate: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!sale) {
    return errors.notFound("Deal status not found");
  }

  const latestSession = sale.verificationSessions[0] ?? null;

  return NextResponse.json({
    ok: true,
    sale_id: sale.id,
    client_reference: sale.clientReference,
    product_name: sale.productName,
    sale_status: sale.status,
    sale_created_at: sale.createdAt.toISOString(),
    sale_updated_at: sale.updatedAt.toISOString(),
    latest_verification_session_id: latestSession?.id ?? null,
    latest_verification_status: latestSession?.status ?? null,
    latest_verification_created_at:
      latestSession?.createdAt.toISOString() ?? null,
    latest_verification_expires_at:
      latestSession?.expiresAt.toISOString() ?? null,
    latest_verification_completed_at:
      latestSession?.completedAt?.toISOString() ?? null,
    latest_verification_declined_at:
      latestSession?.declinedAt?.toISOString() ?? null,
    certificate_id: latestSession?.certificate?.id ?? null,
  });
}
