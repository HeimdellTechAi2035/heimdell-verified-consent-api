// Health check that actually verifies the database connection, unlike
// /api/health (deliberately DB-free). Used by the scheduled uptime check
// workflow -- this is exactly the kind of failure (DB reachable or not)
// that a shallow health check would miss, as seen when a database
// password rotation broke production without /api/health noticing.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    req,
    policy: RATE_LIMIT_POLICIES.healthCheckDeep,
    route: "GET /api/health/deep",
    identifiers: [],
  });
  if (limited) return limited;

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "Heimdell Verified Consent API",
      database: "reachable",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "Heimdell Verified Consent API",
        database: "unreachable",
      },
      { status: 503 }
    );
  }
}
