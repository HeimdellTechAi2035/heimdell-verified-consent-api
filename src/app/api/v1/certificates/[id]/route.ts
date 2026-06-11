// Phase 6 — GET /api/v1/certificates/[id]
// Authenticated certificate retrieval for clients.
// Only the client whose sale generated the certificate may retrieve it.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/auth";
import { errors } from "@/lib/errors";
import {
  mapCertificateToSafeResponse,
  type CertificateWithRelations,
} from "@/lib/certificate";
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
  safeFingerprint,
} from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ------------------------------------------------------------------
  // 1. Authenticate client via x-api-key
  // ------------------------------------------------------------------
  const apiKey = req.headers.get("x-api-key");
  const preAuthLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyPreAuth,
    route: "GET /api/v1/certificates/[id]",
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

  const clientLimited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.apiKeyAuthenticated,
    route: "GET /api/v1/certificates/[id]:client",
    identifiers: [auth.clientId ?? auth.organizationId ?? "api-key"],
  });
  if (clientLimited) return clientLimited;

  // ------------------------------------------------------------------
  // 2. Fetch certificate with the minimal safe relations
  //    — tokenHash, apiKeyHash, encryptedAccountNumber are never selected
  // ------------------------------------------------------------------
  const cert = await db.certificate.findUnique({
    where: { id },
    select: {
      id: true,
      verificationSessionId: true,
      certificateJson: true,
      proofHash: true,
      createdAt: true,
      verificationSession: {
        select: {
          id: true,
          sale: {
            select: {
              id: true,
              clientId: true,
              client: {
                select: {
                  organizationId: true,
                },
              },
              clientReference: true,
            },
          },
        },
      },
    },
  });

  // ------------------------------------------------------------------
  // 3. Return 404 if not found OR belongs to a different client
  //    (returning 404 either way avoids leaking certificate existence)
  // ------------------------------------------------------------------
  const sale = cert?.verificationSession.sale;
  const isClientScopedMatch =
    auth.clientId !== null && sale?.clientId === auth.clientId;
  const isOrganizationScopedMatch =
    auth.clientId === null &&
    auth.organizationId !== null &&
    sale?.client.organizationId === auth.organizationId;

  if (!cert || (!isClientScopedMatch && !isOrganizationScopedMatch)) {
    return errors.notFound("Certificate not found");
  }

  // ------------------------------------------------------------------
  // 4. Return safe response
  // ------------------------------------------------------------------
  return NextResponse.json(
    mapCertificateToSafeResponse(cert as CertificateWithRelations),
    { status: 200 }
  );
}
