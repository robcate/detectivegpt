// app/api/assistants/threads/[threadId]/messages-phone/route.ts
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/app/openai";
import { assistantId } from "@/app/assistant-config";

export const runtime = "nodejs";

/**
 * Single-run endpoint for phone calls. We do a longer poll (up to 60s) to avoid "run is active."
 */
export async function POST(request: NextRequest, { params: { threadId } }) {
  try {
    const { content } = await request.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: "400 empty message" }, { status: 400 });
    }

    // 1) Add user message
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content,
    });

    // 2) Create run
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // 3) Poll up to ~60s
    let finalResult: any = null;
    let done = false;
    let start = Date.now();
    const maxWaitMs = 60000; // 60s

    while (!done) {
      const check = await openai.beta.threads.runs.retrieve(threadId, run.id);
      if (check.status === "completed") {
        finalResult = check.result;
        done = true;
      } else if (check.status === "failed" || check.status === "cancelled") {
        done = true;
      } else {
        // still active => check time
        if (Date.now() - start > maxWaitMs) {
          console.log("❌ run still active => canceling run =>", run.id);
          await openai.beta.threads.runs.cancel(threadId, run.id);
          done = true;
        } else {
          // wait 500ms
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    }

    const assistantReply = finalResult?.message?.content ?? "(no final text)";
    return NextResponse.json({ assistantReply });
  } catch (error: any) {
    console.error("❌ [messages-phone] Error =>", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}