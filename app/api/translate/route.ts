import { NextRequest, NextResponse } from "next/server";
// ⬇ Import the v2 API instead of the old named export:
import { v2 as Translate } from "@google-cloud/translate";

// --------------------------------------------------------------------------------------
// 🔹 YOUR EXISTING LOGS (FROM PREVIOUS CODE) CAN REMAIN AT THE TOP IF YOU WISH
// --------------------------------------------------------------------------------------
console.log("🔹 [api/translate] Starting up the translate route...");

// --------------------------------------------------------------------------------------
// 1) Load the Base64-encoded JSON key from your environment variable
// --------------------------------------------------------------------------------------

const base64Key = process.env.GCP_TRANSLATE_KEY_BASE64;
if (!base64Key) {
  console.error("❌ [api/translate] Missing GCP_TRANSLATE_KEY_BASE64 in environment.");
  throw new Error("Missing GCP_TRANSLATE_KEY_BASE64 environment variable.");
}

// --------------------------------------------------------------------------------------
// 2) Decode the Base64 string into a JSON string
// --------------------------------------------------------------------------------------

console.log("🔹 [api/translate] Decoding Base64 credentials...");
const jsonString = Buffer.from(base64Key, "base64").toString("utf8");

// --------------------------------------------------------------------------------------
// 3) Parse the JSON to get the credentials object
// --------------------------------------------------------------------------------------

let googleCreds: any;
try {
  googleCreds = JSON.parse(jsonString);
  console.log("🔹 [api/translate] Successfully parsed JSON credentials.");
} catch (err) {
  console.error("❌ [api/translate] Error parsing JSON from Base64 =>", err);
  throw err;
}

// --------------------------------------------------------------------------------------
// 4) Initialize the Google Cloud Translate client (v2)
// --------------------------------------------------------------------------------------
const translateClient = new Translate.Translate({
  credentials: googleCreds,
  projectId: googleCreds.project_id,
});

// --------------------------------------------------------------------------------------
// POST /api/translate
// --------------------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // 🔹 Any existing logs you had remain here
    console.log("🔹 [api/translate] POST request received.");

    // 5) Parse the incoming JSON body
    const { text, targetLang } = await req.json();

    // 🔹 Keep your logs exactly as before:
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

    // 6) Call Google Cloud Translate (v2)
    console.log(`🟨 [api/translate] Translating => "${text}" to => "${targetLang}"...`);
    const [translation] = await translateClient.translate(text, targetLang);

    console.log("🟨 [api/translate] Received translation =>", translation);

    // 7) Return the JSON response
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
