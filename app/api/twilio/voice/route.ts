// app/api/twilio/voice/route.ts
import { NextRequest, NextResponse } from "next/server";
import { enqueueTranscriptionJob } from "../../../../lib/queue";

export async function POST(request: NextRequest) {
  try {
    // Parse form data from Twilio
    const formData = await request.formData();
    const callStatus = formData.get("CallStatus") as string | null;
    const digits = formData.get("Digits") as string | null;
    const recordingUrl = formData.get("RecordingUrl") as string | null;
    const callSid = formData.get("CallSid") as string | null;

    console.log("🔹 [route.ts] Twilio webhook =>", {
      callStatus,
      digits,
      recordingUrl,
      callSid,
    });

    // 1) If there's a RecordingUrl, user just finished recording
    //    or hung up (Twilio might pass digits='hangup')
    if (recordingUrl) {
      console.log("🔹 [route.ts] Final recording =>", recordingUrl);

      if (!callSid) {
        throw new Error("Missing callSid, cannot enqueue transcription");
      }

      // Enqueue transcription
      console.log("🔹 [route.ts] Enqueueing transcription job...");
      await enqueueTranscriptionJob({ recordingUrl, callSid });

      // Return final TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Thanks for your recording. We are processing it now. Goodbye.</Say>
          <Hangup/>
        </Response>`;
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    // 2) If no Digits yet, return Gather
    if (!digits) {
      console.log("🔹 [route.ts] No digits => returning Gather TwiML");
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Welcome to Detective GPT. Press 1 to record a statement. Press 2 to talk to an agent.</Say>
          <Gather action="/api/twilio/voice" method="POST" timeout="5" numDigits="1" />
        </Response>`;
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    // 3) If Digits exist, handle them
    console.log("🔹 [route.ts] User pressed digits =>", digits);
    if (digits === "1") {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Please leave your statement after the tone. Press pound when done, or wait for the time limit.</Say>
          <Record action="/api/twilio/voice" method="POST" maxLength="60" finishOnKey="#" beep="true" />
        </Response>`;
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    } else if (digits === "2") {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Connecting you to an agent now.</Say>
          <Dial>+1XXXYYYZZZZ</Dial>
        </Response>`;
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    } else {
      // Invalid input => redirect to main menu
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Invalid input. Please try again.</Say>
          <Redirect>/api/twilio/voice</Redirect>
        </Response>`;
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    }
  } catch (error) {
    console.error("❌ [route.ts] Error in Twilio voice route:", error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Sorry, there was an error. Please try again later.</Say>
        <Hangup/>
      </Response>`;
    return new NextResponse(errorTwiml, {
      headers: { "Content-Type": "text/xml" },
      status: 500,
    });
  }
}
