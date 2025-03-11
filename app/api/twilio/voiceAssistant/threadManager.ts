// app/api/twilio/voiceAssistant/threadManager.ts
import { redis } from "@/lib/redisClient"; // or wherever you put your Redis client
import { createNewThread } from "./openAIHelpers"; // pseudo-code for your thread creation

/**
 * If a threadId already exists for this callSid, return it.
 * Otherwise, create a new thread, store it in Redis, and return.
 */
export async function getOrCreateThreadForCall(callSid: string): Promise<string> {
  // 1) Check Redis
  const existingThreadId = await redis.get(`callSid:${callSid}`);
  if (existingThreadId) {
    console.log("🔹 [threadManager] Found existing threadId in Redis =>", existingThreadId);
    return existingThreadId;
  }

  // 2) Otherwise, create a new thread via your /api/assistants/threads or OpenAI
  console.log("🔹 [threadManager] No thread in Redis; creating new thread...");
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/assistants/threads`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to create thread. HTTP ${response.status}`);
  }
  const data = await response.json();
  const newThreadId = data.threadId;

  // 3) Store in Redis so next request sees it
  await redis.set(`callSid:${callSid}`, newThreadId);
  console.log("🔹 [threadManager] Created thread =>", newThreadId);

  return newThreadId;
}

/**
 * Send the user's text to your existing GPT endpoint,
 * return the final text reply. 
 * (Same code as before, just omit the in-memory map.)
 */
export async function sendMessageToAssistant(threadId: string, userText: string): Promise<string> {
  console.log("🔹 [threadManager] Sending userText =>", userText, "for thread =>", threadId);

  // fetch your /api/assistants/threads/[threadId]/messages
  const resp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/assistants/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: userText }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to send user message => ${await resp.text()}`);
  }
  // if it returns SSE streaming, you'll parse differently; 
  // if it returns JSON, do:
  const data = await resp.json();
  return data.assistantReply || "(no reply)";
}