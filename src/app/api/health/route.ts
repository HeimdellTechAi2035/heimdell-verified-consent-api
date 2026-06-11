// Phase 1 foundations — health check endpoint
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Heimdell Verified Consent API",
  });
}
