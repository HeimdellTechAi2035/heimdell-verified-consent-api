// POST /api/v1/voice/verification/[token]/recording-status
// Twilio posts here once the call recording is ready -- typically after the
// call has ended, i.e. after any certificate was already created. Recording
// details are supplementary evidence on PhoneVerificationAttempt only; the
// already-immutable Certificate is never touched.

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTwilioRequest, TwilioSignatureError } from "@/lib/twilio-signature";

export async function POST(req: NextRequest) {
  let formParams: Record<string, string>;
  try {
    formParams = await verifyTwilioRequest(req);
  } catch (err) {
    if (err instanceof TwilioSignatureError) {
      console.error("[voice/recording-status] signature verification failed:", err.message);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  const callSid = formParams.CallSid;
  const recordingSid = formParams.RecordingSid;
  const recordingUrl = formParams.RecordingUrl;
  const recordingDuration = formParams.RecordingDuration
    ? Number.parseInt(formParams.RecordingDuration, 10)
    : null;

  if (!callSid || !recordingSid) {
    return NextResponse.json({ ok: true });
  }

  await db.phoneVerificationAttempt.updateMany({
    where: { providerCallSid: callSid },
    data: {
      recordingSid,
      recordingUrl: recordingUrl ?? null,
      recordingDurationSeconds: Number.isFinite(recordingDuration) ? recordingDuration : null,
    },
  });

  return NextResponse.json({ ok: true });
}
