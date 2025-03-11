// worker/transcriptionWorker.ts

// 1) Import BullMQ's Worker under a different name (BullWorker) to avoid collision with the DOM "Worker"
const { Worker: BullWorker } = require("bullmq");

// 2) Load .env if needed
const dotenv = require("dotenv");
dotenv.config();

console.log("🔹 [transcriptionWorker.ts] Starting transcription worker...");

// Debug logs for environment variables
console.log("🔹 [transcriptionWorker.ts] REDIS_HOST =>", process.env.REDIS_HOST);
console.log("🔹 [transcriptionWorker.ts] REDIS_PORT =>", process.env.REDIS_PORT);
console.log("🔹 [transcriptionWorker.ts] REDIS_PASSWORD =>", process.env.REDIS_PASSWORD);

// 3) Create the worker (renamed to BullWorker)
const worker = new BullWorker(
  "transcription",
  async (job) => {
    const { recordingUrl, callSid } = job.data;
    console.log("🔹 [transcriptionWorker.ts] Received job =>", job.id, { recordingUrl, callSid });

    // 1) Download the audio from Twilio (.wav)
    const audioUrl = `${recordingUrl}.wav`;
    console.log("🔹 [transcriptionWorker.ts] Downloading audio =>", audioUrl);

    const audioRes = await fetch(audioUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN
        ).toString("base64")}`,
      },
    });
    if (!audioRes.ok) {
      const errText = await audioRes.text();
      throw new Error(`Failed to download audio from Twilio: ${errText}`);
    }
    const audioBuffer = await audioRes.arrayBuffer();

    // 2) Send audio to Whisper
    console.log("🔹 [transcriptionWorker.ts] Sending audio to Whisper...");
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), "audio.wav");
    formData.append("model", "whisper-1");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });
    if (!whisperRes.ok) {
      const errorText = await whisperRes.text();
      throw new Error(`Whisper transcription failed: ${errorText}`);
    }
    const whisperData = await whisperRes.json();
    const transcriptionText = whisperData.text;
    console.log("✅ [transcriptionWorker.ts] Transcription result =>", transcriptionText);

    // 3) Integrate with your logic
    await updateCrimeReport(callSid, transcriptionText);
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      tls: {}
    },
  }
);

// Example function to integrate transcription results
function updateCrimeReport(callSid: string, transcription: string) {
  console.log("🔹 [transcriptionWorker.ts] updateCrimeReport =>", { callSid, transcription });
  // e.g., fetch("/api/airtable", { ... }) or update a DB, etc.
}

// Worker event listeners
worker.on("completed", (job) => {
  console.log(`✅ [transcriptionWorker.ts] Job ${job.id} completed successfully.`);
});
worker.on("failed", (job, err) => {
  console.error(`❌ [transcriptionWorker.ts] Job ${job.id} failed:`, err);
});
