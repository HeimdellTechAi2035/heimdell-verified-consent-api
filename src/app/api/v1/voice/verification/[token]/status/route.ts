// POST /api/v1/voice/verification/[token]/status
// Twilio call-status callback -- updates the PhoneVerificationAttempt's
// lifecycle (queued/ringing/in-progress/completed/etc). Purely informational
// bookkeeping; never touches Certificate/VerificationSession/Sale.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTwilioRequest, TwilioSignatureError } from "@/lib/twilio-signature";
import type { PhoneCallStatus } from "@prisma/client";

const STATUS_MAP: Record<string, PhoneCallStatus> = {
  queued: "QUEUED",
  initiated: "INITIATED",
  ringing: "RINGING",
  "in-progress": "IN_PROGRESS",
  completed: "COMPLETED",
  busy: "BUSY",
  failed: "FAILED",
  "no-answer": "NO_ANSWER",
  canceled: "CANCELED",
};

export async function POST(req: NextRequest) {
  let formParams: Record<string, string>;
  try {
    formParams = await verifyTwilioRequest(req);
  } catch (err) {
    if (err instanceof TwilioSignatureError) {
      console.error("[voice/status] signature verification failed:", err.message);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  const callSid = formParams.CallSid;
  const rawStatus = formParams.CallStatus?.toLowerCase();
  const mappedStatus = rawStatus ? STATUS_MAP[rawStatus] : undefined;

  if (!callSid || !mappedStatus) {
    return NextResponse.json({ ok: true }); // nothing sane to record
  }

  const isTerminal = ["COMPLETED", "BUSY", "FAILED", "NO_ANSWER", "CANCELED"].includes(mappedStatus);

  await db.phoneVerificationAttempt.updateMany({
    where: { providerCallSid: callSid },
    data: {
      status: mappedStatus,
      ...(mappedStatus === "IN_PROGRESS" ? { answeredAt: new Date() } : {}),
      ...(isTerminal ? { completedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
