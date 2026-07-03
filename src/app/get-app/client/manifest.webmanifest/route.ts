import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/pwa-identity";

export function GET() {
  return NextResponse.json(buildManifest("client"), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
