import { v2 as Translate } from "@google-cloud/translate";

const translator = new Translate.Translate();

/**
 * Detect the language of `text`.
 * Logs for debugging so you can see it in your server console.
 */
export async function detectLanguage(text: string): Promise<string> {
  console.log("🟨 [translate.ts] detectLanguage =>", text);
  const [detections] = await translator.detect(text);
  const detection = Array.isArray(detections) ? detections[0] : detections;
  console.log("🟨 [translate.ts] detected =>", detection.language);
  return detection.language;
}

/**
 * Translate `text` from its original language to `targetLang`.
 * Logs the input and result for debugging.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  console.log("🟨 [translate.ts] Translating =>", text, "to =>", targetLang);
  const [translation] = await translator.translate(text, targetLang);
  console.log("🟨 [translate.ts] result =>", translation);
  return translation;
}
