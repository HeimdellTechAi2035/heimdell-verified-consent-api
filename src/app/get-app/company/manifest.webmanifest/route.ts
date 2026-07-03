import { NextResponse } from "next/server";
import { buildManifest } from "@/lib/pwa-identity";

export function GET() {
  return NextResponse.json(buildManifest("company"), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
