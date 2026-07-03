import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/pwa-identity";

export function GET() {
  return NextResponse.json(buildManifest("seller"), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
