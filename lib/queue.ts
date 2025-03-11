// lib/queue.ts
import { Queue } from "bullmq";

console.log("🔹 [queue.ts] Initializing BullMQ transcription queue...");

// Debug logs for environment variables
console.log("🔹 [queue.ts] REDIS_HOST =>", process.env.REDIS_HOST);
console.log("🔹 [queue.ts] REDIS_PORT =>", process.env.REDIS_PORT);
console.log("🔹 [queue.ts] REDIS_PASSWORD =>", process.env.REDIS_PASSWORD);

// Create a queue named "transcription"
const transcriptionQueue = new Queue("transcription", {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    // For Upstash or any TLS-based Redis, add this:
    tls: {}
  },
});

export async function enqueueTranscriptionJob(payload: {
  recordingUrl: string;
  callSid: string;
}) {
  console.log("🔹 [queue.ts] enqueueTranscriptionJob =>", payload);
  await transcriptionQueue.add("transcribe", payload, {
    attempts: 5,         // Retry up to 5 times if the job fails
    backoff: 2000,       // Wait 2 seconds between retries
    removeOnComplete: true,
    removeOnFail: false,
  });
}
