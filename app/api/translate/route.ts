// app/api/translate/route.ts
import { NextResponse } from "next/server";
import { v2 as Translate } from "@google-cloud/translate";
import dotenv from "dotenv";

dotenv.config(); // If you need to load .env

// We'll do server-side translation here
const translator = new Translate.Translate();

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();
    console.log("🟨 [api/translate] Translating =>", text, "to =>", targetLang);

    const [translation] = await translator.translate(text, targetLang);
    return NextResponse.json({ success: true, translation });
  } catch (err: any) {
    console.error("❌ [api/translate] Error =>", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
