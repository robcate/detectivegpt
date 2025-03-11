// app/api/twilio/voiceAssistant/translateHelper.ts
import { v2 as Translate } from "@google-cloud/translate";

let translator: Translate.Translate;

// 1) Set up translator credentials (unchanged from your version)
if (process.env.GCP_TRANSLATE_KEY_BASE64) {
  const base64Key = process.env.GCP_TRANSLATE_KEY_BASE64;
  const jsonString = Buffer.from(base64Key, "base64").toString("utf8");
  const googleCreds = JSON.parse(jsonString);

  translator = new Translate.Translate({
    credentials: googleCreds,
    projectId: googleCreds.project_id,
  });
} else {
  translator = new Translate.Translate();
}

/**
 * Detect the language of `text`.
 * If text is empty or detection fails, return "und" (undetermined).
 */
export async function detectLanguage(text: string): Promise<string> {
  // Handle empty or whitespace text => "und"
  if (!text?.trim()) {
    return "und";
  }

  const [detections] = await translator.detect(text);
  const detection = Array.isArray(detections) ? detections[0] : detections;
  const lang = detection.language || "und";
  // If Google can't detect, it might be "und"
  return lang;
}

/**
 * Translate `text` to `targetLang`. 
 * If `targetLang` is "und" or falsy, we skip translation and return `text`.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!targetLang || targetLang === "und") {
    // skip or treat as English
    return text;
  }

  const [translated] = await translator.translate(text, targetLang);
  return translated;
}