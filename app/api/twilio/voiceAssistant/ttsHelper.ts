// app/api/twilio/voiceAssistant/ttsHelper.ts
import textToSpeech from "@google-cloud/text-to-speech";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";

let googleCreds: any | undefined;
let projectId: string | undefined;

if (process.env.GCP_TRANSLATE_KEY_BASE64) {
  const base64Key = process.env.GCP_TRANSLATE_KEY_BASE64;
  const jsonString = Buffer.from(base64Key, "base64").toString("utf8");
  googleCreds = JSON.parse(jsonString);
  projectId = googleCreds.project_id;
}

let ttsClient: textToSpeech.TextToSpeechClient;
if (googleCreds) {
  ttsClient = new textToSpeech.TextToSpeechClient({
    credentials: googleCreds,
    projectId,
  });
} else {
  ttsClient = new textToSpeech.TextToSpeechClient();
}

let storage: Storage;
if (googleCreds) {
  storage = new Storage({ credentials: googleCreds, projectId });
} else {
  storage = new Storage();
}

const bucketName = process.env.GCP_TTS_BUCKET || "detective-gpt-tts-bucket";

/**
 * Convert text -> MP3, upload to GCS, return short-lived signed URL
 */
export async function generateTtsUrl(text: string, language: string): Promise<string> {
  // Choose a voice
  let languageCode = "en-US";
  let voiceName = "en-US-Wavenet-D";
  if (language.startsWith("es")) {
    languageCode = "es-US";
    voiceName = "es-US-Wavenet-A";
  }

  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: { audioEncoding: "MP3" },
  });
  if (!response.audioContent) {
    throw new Error("No audioContent from Google TTS");
  }

  // Upload
  const audioBuffer = Buffer.from(response.audioContent, "base64");
  const fileName = `tts-audio/${uuidv4()}.mp3`;
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.save(audioBuffer, {
    contentType: "audio/mpeg",
    resumable: false,
  });

  // 5-minute signed URL
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000,
  });
  return signedUrl;
}
