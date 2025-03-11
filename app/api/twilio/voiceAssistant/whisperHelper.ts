// app/api/twilio/voiceAssistant/whisperHelper.ts

export async function transcribeAudioShort(recordingUrl: string): Promise<string> {
  console.log("🔹 [whisperHelper] Transcribing =>", recordingUrl);

  // 1) Download from Twilio EXACTLY as given
  const audioRes = await fetch(recordingUrl, {
    headers: {
      Authorization: `Basic ${btoa(
        process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN
      )}`,
    },
  });
  if (!audioRes.ok) {
    throw new Error(`Error downloading audio from Twilio: ${await audioRes.text()}`);
  }
  const audioBuffer = await audioRes.arrayBuffer();

  // 2) Send to Whisper
  const formData = new FormData();
  // We'll just name it audio.mp3
  formData.append("file", new Blob([audioBuffer]), "audio.mp3");
  formData.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });
  if (!whisperRes.ok) {
    throw new Error(`Whisper transcription failed: ${await whisperRes.text()}`);
  }

  const whisperData = await whisperRes.json();
  console.log("🔹 [whisperHelper] Transcribed text =>", whisperData.text);
  return whisperData.text;
}
