import { NextRequest, NextResponse } from "next/server";
// Use the v2 API from @google-cloud/translate
import { v2 as Translate } from "@google-cloud/translate";

console.log("🔹 [api/translate] Starting up the translate route...");

// 1) Initialize the Google Cloud Translate (v2) client
// This automatically uses `GOOGLE_APPLICATION_CREDENTIALS=./translate-key.json`
const translateClient = new Translate.Translate();

// 2) Define the POST endpoint
export async function POST(req: NextRequest) {
  try {
    console.log("🔹 [api/translate] POST request received.");

    // 3) Parse the request JSON
    const { text, targetLang } = await req.json();
    console.log("🟨 [api/translate] Received text =>", text);
    console.log("🟨 [api/translate] Target language =>", targetLang);

    // Basic validation
    if (!text || !targetLang) {
      console.warn("🟨 [api/translate] Missing 'text' or 'targetLang' in request body.");
      return NextResponse.json(
        { success: false, error: "Missing 'text' or 'targetLang' parameter" },
        { status: 400 }
      );
    }

    // 4) Call the Translate API
    console.log(`🟨 [api/translate] Translating => "${text}" to => "${targetLang}"...`);
    const [translation] = await translateClient.translate(text, targetLang);
    console.log("🟨 [api/translate] Received translation =>", translation);

    // 5) Return JSON
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
