// app/api/twilio/voiceAssistant/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Called exactly once at inbound call. 
 * Greets, then <Record>. 
 * The next route is /afterRecord for the live call flow,
 * while /recordingCallback does the GPT in the background.
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[voiceAssistant/route.ts] Incoming call => greeting user now...");

    // Minimal TwiML to avoid parse errors:
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>
<Say voice="Polly.Joanna">Hello, thank you for reaching out, I'm here to take your statement. Please leave your statement after the beep, then press pound.</Say>
<Record maxLength="60" finishOnKey="#" playBeep="true"
  action="/api/twilio/voiceAssistant/afterRecord"
  method="POST"
  recordingStatusCallback="/api/twilio/voiceAssistant/recordingCallback"
  recordingStatusCallbackMethod="POST" />
</Response>`;

    console.log("[voiceAssistant/route.ts] Returning TwiML =>\n", twiml);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" }});
  } catch (err) {
    console.error("[voiceAssistant/route.ts] Error =>", err);
    const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, error occurred.</Say><Hangup/></Response>`;
    return new NextResponse(errorTwiML, {
      headers: { "Content-Type": "text/xml" },
      status: 500,
    });
  }
}
