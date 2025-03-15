import { NextRequest, NextResponse } from "next/server";
// Use the v2 API from @google-cloud/translate
import { v2 as Translate } from "@google-cloud/translate";
import fs from "fs";

// -------------------------------
// 1) Decode env var & write /tmp/translate-key.json
// -------------------------------
if (process.env.TRANSLATE_KEY_BASE64) {
  try {
    const decoded = Buffer.from(process.env.TRANSLATE_KEY_BASE64, "base64").toString("utf8");
    fs.writeFileSync("/tmp/translate-key.json", decoded);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/translate-key.json";

    // (Optional) Log partial for debugging
    console.log(
      "[translate/route.ts] Wrote /tmp/translate-key.json. Partial: ",
      process.env.TRANSLATE_KEY_BASE64.slice(0, 20) + "..."
    );
  } catch (err) {
    console.error("[translate/route.ts] Failed writing /tmp/translate-key.json =>", err);
  }
} else {
  console.warn("[translate/route.ts] No TRANSLATE_KEY_BASE64 found in environment!");
}

// -------------------------------
// 2) Initialize the Translate client
// -------------------------------
const translateClient = new Translate.Translate();

// -------------------------------
// 3) The POST handler
// -------------------------------
export async function POST(req: NextRequest) {
  try {
    console.log("🔹 [api/translate] POST request received.");

    // 3a) Parse the request JSON
    const { text, targetLang } = await req.json();
    console.log("🟨 [api/translate] Received text =>", text);
    console.log("🟨 [api/translate] Target language =>", targetLang);

    if (!text || !targetLang) {
      console.warn("🟨 [api/translate] Missing 'text' or 'targetLang' in request body.");
      return NextResponse.json(
        { success: false, error: "Missing 'text' or 'targetLang' parameter" },
        { status: 400 }
      );
    }

    // 3b) Call the Translate API
    console.log(`🟨 [api/translate] Translating => "${text}" to => "${targetLang}"...`);
    const [translation] = await translateClient.translate(text, targetLang);
    console.log("🟨 [api/translate] Received translation =>", translation);

    // 3c) Return JSON
    return NextResponse.json({
      success: true,
      translation,
    });
  } catch (error: any) {
    console.error("❌ [api/translate] Error =>", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
