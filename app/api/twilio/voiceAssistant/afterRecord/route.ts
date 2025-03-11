// app/api/twilio/voiceAssistant/afterRecord/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redisClient";

export async function POST(request: NextRequest) {
  try {
    console.log("[afterRecord] => continuing the phone call flow");

    const formData = await request.formData();
    const callSid = formData.get("CallSid")?.toString() || "";
    console.log("[afterRecord] formData =>", Object.fromEntries(formData));

    // Check if we have a new GPT message from the snippet that just finished
    const gptToRead = await redis.get(`assistantToRead:${callSid}`);
    let detectiveSpeech = "One moment while we process your statement...";

    if (gptToRead) {
      detectiveSpeech = gptToRead;
      // Remove it so we don't re-read next time
      await redis.del(`assistantToRead:${callSid}`);
    }

    // Build TwiML: read the GPT text, then record again
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${detectiveSpeech}</Say>
  <Pause length="1"/>
  <Record maxLength="60" finishOnKey="#" playBeep="true" fileFormat="mp3"
    action="/api/twilio/voiceAssistant/afterRecord" method="POST"
    recordingStatusCallback="/api/twilio/voiceAssistant/recordingCallback"
    recordingStatusCallbackMethod="POST" />
</Response>`;

    console.log("[afterRecord] returning TwiML =>\n", twiml);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (err: any) {
    console.error("[afterRecord] Error =>", err);
    const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, an error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(errorTwiML, {
      headers: { "Content-Type": "text/xml" },
      status: 500,
    });
  }
}
