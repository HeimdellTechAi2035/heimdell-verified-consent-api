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

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { sessionId } = await params;
  const token = extractBearerEmbedToken(request);
  const limited = await enforceRateLimit({
    req: request,
    policy: RATE_LIMIT_POLICIES.embedStatus,
    route: "GET /api/v1/embed/verification/[sessionId]/status",
    identifiers: [
      safeFingerprint(sessionId, 16),
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
      expectedScope: "verification_status",
      expectedTargetId: sessionId,
    });
  } catch (error) {
    if (error instanceof EmbedTokenError) {
      return errors.unauthorized("Invalid or expired embed token");
    }
    throw error;
  }

  const session = await db.verificationSession.findFirst({
    where: {
      id: sessionId,
      sale: {
        ...(claims.clientId ? { clientId: claims.clientId } : {}),
        client: {
          organizationId: claims.organizationId,
        },
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      expiresAt: true,
      openedAt: true,
      completedAt: true,
      declinedAt: true,
      certificate: {
        select: { id: true },
      },
      sale: {
        select: {
          id: true,
          clientReference: true,
          productName: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    return errors.notFound("Verification status not found");
  }

  return NextResponse.json({
    ok: true,
    session_id: session.id,
    sale_id: session.sale.id,
    client_reference: session.sale.clientReference,
    product_name: session.sale.productName,
    verification_status: session.status,
    sale_status: session.sale.status,
    created_at: session.createdAt.toISOString(),
    expires_at: session.expiresAt.toISOString(),
    opened_at: session.openedAt?.toISOString() ?? null,
    completed_at: session.completedAt?.toISOString() ?? null,
    declined_at: session.declinedAt?.toISOString() ?? null,
    certificate_id: session.certificate?.id ?? null,
    certificate_url: session.certificate?.id
      ? `/api/v1/certificates/${session.certificate.id}`
      : null,
  });
}
