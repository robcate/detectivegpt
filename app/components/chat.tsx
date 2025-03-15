"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./chat.module.css";
import { AssistantStream } from "openai/lib/AssistantStream";
import Markdown from "react-markdown";
// @ts-expect-error (no official types yet)
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

/**
 * A single message in the conversation
 */
type MessageProps = {
  role: "user" | "assistant" | "code";
  text: string;
  timestamp?: Date;
};

/**
 * Props for our Chat component
 */
type ChatProps = {
  /**
   * functionCallHandler is used whenever we receive a "requires_action" with
   * some function calls (like update_crime_report).
   */
  functionCallHandler?: (toolCall: RequiredActionFunctionToolCall) => Promise<string>;

  /**
   * initialMessages optionally loads a short "assistant" prompt at the start
   */
  initialMessages?: { role: "assistant"; content: string }[];

  /**
   * Called each time we update the local conversationLog so page.tsx can store it.
   */
  onConversationUpdated?: (fullTextLog: string) => void;
};

// ----------------------------------------------------------------
// Components for each message type
// ----------------------------------------------------------------
const UserMessage = ({ text, timestamp }: { text: string; timestamp?: Date }) => {
  return (
    <div className={styles.userMessage}>
      <div className={styles.messageContent}>
        {text}
        <div className={styles.timestamp} suppressHydrationWarning>
          {(timestamp || new Date()).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

const AssistantMessage = ({ text, timestamp }: { text: string; timestamp?: Date }) => {
  return (
    <div className={styles.assistantMessage} style={{ textAlign: "left" }}>
      <img className={styles.avatarImage} src="/detective-avatar.png" alt="DetectiveGPT" />
      <div className={styles.messageContent}>
        <Markdown>{text}</Markdown>
        <div className={styles.timestamp} suppressHydrationWarning>
          {(timestamp || new Date()).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

const CodeMessage = ({ text }: { text: string }) => (
  <div className={styles.codeMessage}>
    {text.split("\n").map((line, index) => (
      <div key={index}>
        <span>{`${index + 1}. `}</span>
        {line}
      </div>
    ))}
  </div>
);

/**
 * Decides which sub‐component to render for a message
 */
function Message({ role, text, timestamp }: MessageProps) {
  switch (role) {
    case "user":
      return <UserMessage text={text} timestamp={timestamp} />;
    case "assistant":
      return <AssistantMessage text={text} timestamp={timestamp} />;
    case "code":
      return <CodeMessage text={text} />;
    default:
      return null;
  }
}

// ----------------------------------------------------------------
// Main Chat component
// ----------------------------------------------------------------
export default function Chat({
  functionCallHandler = () => Promise.resolve(""),
  initialMessages = [],
  onConversationUpdated = () => {},
}: ChatProps) {
  const [messages, setMessages] = useState<MessageProps[]>([]);
  const [userInput, setUserInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);

  // We'll store a ref to mirror inputDisabled so we can read it in an async loop
  const inputDisabledRef = useRef(inputDisabled);
  useEffect(() => {
    inputDisabledRef.current = inputDisabled;
  }, [inputDisabled]);

  // A small helper to wait until `inputDisabled` is false
  async function waitForRunToComplete(
    checkIntervalMs: number = 250,
    maxWaitMs: number = 10000
  ): Promise<void> {
    console.log("[chat.tsx] waitForRunToComplete => waiting for streaming to finish...");
    const startTime = Date.now();
    while (true) {
      if (!inputDisabledRef.current) {
        console.log("[chat.tsx] waitForRunToComplete => run finished => continuing");
        return;
      }
      if (Date.now() - startTime > maxWaitMs) {
        console.warn("[chat.tsx] waitForRunToComplete => Timed out waiting for run to complete.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }

  // The threadId is created once on mount, so the assistant can keep context
  const [threadId, setThreadId] = useState("");

  // We'll store a ref to the bottom div so we can scroll down
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // We'll build up a plain‐text conversationLog to pass back
  const conversationLogRef = useRef("");

  // A ref to track if we've already run the typed greeting (so no double calls in dev)
  const typedGreetingRef = useRef(false);

  // A ref for the file input so we can reset it after upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * We'll track if the user has actually sent a message. If false, we skip auto-scrolling on mount.
   */
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);

  /**
   * A helper to append lines to our local conversationLog, then call
   * onConversationUpdated so the parent (page.tsx) can store it too.
   *
   * This also SKIPS logging if text is empty or "undefined".
   */
  function appendLog(role: "user" | "assistant", text: string) {
    if (!text || text.trim() === "" || text.trim() === "undefined") {
      // Skip logging empty/undefined messages
      return;
    }
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${role === "user" ? "User" : "Assistant"}: ${text}\n`;
    conversationLogRef.current += line;
    onConversationUpdated(conversationLogRef.current);
  }

  /**
   * On mount, either load initial messages or run a typed greeting
   */
  useEffect(() => {
    if (initialMessages.length > 0) {
      // We'll just set them as starting messages
      const preloaded = initialMessages.map((m) => ({
        role: m.role,
        text: m.content,
        timestamp: new Date(),
      }));
      setMessages(preloaded);

      // Also log them once
      preloaded.forEach((msg) => {
        appendLog("assistant", msg.text);
      });
    } else {
      // If no initial messages => do a short typed greeting
      if (!typedGreetingRef.current) {
        typedGreetingRef.current = true; // ensure we only do this once
        setMessages([{ role: "assistant", text: "", timestamp: new Date() }]);

        const INTRO_TEXT = "🚔 GPT is ready to take your statement. Please describe what happened.";
        let index = 0;

        const interval = setInterval(() => {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];

            // If finished
            if (index >= INTRO_TEXT.length) {
              clearInterval(interval);
              // Once fully typed, log it (if not empty)
              if (last.text.trim().length > 0) {
                appendLog("assistant", last.text);
              }
              return prev;
            }

            // Otherwise, append the next character
            const updated = { ...last, text: last.text + INTRO_TEXT[index] };
            index++;
            return [...prev.slice(0, -1), updated];
          });
        }, 30);
        return () => clearInterval(interval);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Only scroll to bottom if user has actually sent a message
   * or if there's new assistant content AFTER the user has begun chatting.
   */
  useEffect(() => {
    if (!hasUserSentMessage) {
      // Skip scrolling on first load
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, hasUserSentMessage]);

  /**
   * Create a new Thread on mount
   */
  useEffect(() => {
    const createThread = async () => {
      console.log("[chat.tsx] Creating new thread...");
      const res = await fetch("/api/assistants/threads", { method: "POST" });
      const data = await res.json();
      console.log("[chat.tsx] Created thread =>", data.threadId);
      setThreadId(data.threadId);
    };
    createThread();
  }, []);

  /**
   * On user pressing "Send"
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userInput.trim()) return;

    // Mark that the user has now sent at least one message
    setHasUserSentMessage(true);

    // We'll create a new user message
    const newMsg: MessageProps = {
      role: "user",
      text: userInput,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
    appendLog("user", userInput);

    sendToGPT(userInput);
    setUserInput("");
    setInputDisabled(true);
  }

  async function sendToGPT(text: string) {
    console.log("[chat.tsx] sendMessage =>", text);
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    attachStreamListeners(stream);
  }

  /**
   * handleRequiresAction => calling functionCallHandler for each tool call
   */
  async function handleRequiresAction(event: AssistantStreamEvent.ThreadRunRequiresAction) {
    console.log("[chat.tsx] handleRequiresAction => event:", event);
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    console.log("[chat.tsx] toolCalls =>", toolCalls);

    // For each tool call, we call functionCallHandler
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall: RequiredActionFunctionToolCall) => {
        console.log("[chat.tsx] handleRequiresAction => calling functionCallHandler =>", toolCall);
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );

    setInputDisabled(true);

    // Then we POST back these results
    const resp = await fetch(`/api/assistants/threads/${threadId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, toolCallOutputs }),
    });
    const stream = AssistantStream.fromReadableStream(resp.body);
    attachStreamListeners(stream);
  }

  /**
   * Attach all listeners to the assistant response stream
   */
  function attachStreamListeners(stream: AssistantStream) {
    console.log("[chat.tsx] attachStreamListeners => attaching...");
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);
    stream.on("event", (event) => {
      console.log("[chat.tsx] stream on(event) =>", event);
      if (event.event === "thread.run.requires_action") handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  }

  /**
   * stream event handlers
   */
  function handleTextCreated() {
    console.log("[chat.tsx] handleTextCreated => creating new assistant message container...");
    // Insert an empty assistant message so we can append textDelta
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", timestamp: new Date() },
    ]);
  }

  function handleTextDelta(delta: any) {
    if (delta.value != null) {
      console.log("[chat.tsx] handleTextDelta => appending chunk:", delta.value);
      // Append to last assistant message
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updated = { ...last, text: last.text + delta.value };
        return [...prev.slice(0, -1), updated];
      });
    }
  }

  function handleRunCompleted() {
    console.log("[chat.tsx] handleRunCompleted => done streaming => enable input");
    // Once final message is done, we log it if not empty
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      appendLog("assistant", lastMsg.text);
    }
    setInputDisabled(false);
  }

  // A helper to pass a text note to GPT, so GPT sees that new images were uploaded
  async function notifyGPTOfFileUpload(messageContent: string) {
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: messageContent }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    attachStreamListeners(stream);
  }

  /**
   * File upload
   */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;

    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append("files", file));

    console.log("[chat.tsx] handleFileChange => uploading files =>", e.target.files);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      console.log("[chat.tsx] File upload => response:", res.status);

      if (res.ok) {
        // { fileUrls, observations }
        const { fileUrls, observations } = await res.json();
        console.log("[chat.tsx] fileUrls =>", fileUrls);
        console.log("[chat.tsx] observations =>", observations);

        // We'll accumulate a summary for GPT about all uploaded files
        let combinedMessageForGPT = "User uploaded new file(s) with observations:\n";

        // For each file, we'll post an assistant message with the link + short observation
        fileUrls.forEach((url: string, idx: number) => {
          const note = observations[idx] || "(No observation)";
          let text = "";
          if (/\.(png|jpe?g|gif|webp)$/i.test(url)) {
            text = `![Uploaded Image](${url})\n\n**Observation:** ${note}`;
          } else {
            text = `**File Uploaded**: [Link](${url})\n**Observation:** ${note}`;
          }

          // Show in local chat UI
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text, timestamp: new Date() },
          ]);
          appendLog("assistant", text);

          // Also add it to the combined message
          combinedMessageForGPT += ` - ${url}\n   Observation: ${note}\n`;
        });

        // Also call update_crime_report with both evidence + evidenceObservations
        if (functionCallHandler) {
          const joinedUrls = fileUrls.join(", ");
          const joinedObs = observations.join("\n");

          // Provide the 'id' and 'type' that the RequiredActionFunctionToolCall interface expects
          const updateCall: RequiredActionFunctionToolCall = {
            id: "temp-id",
            type: "function",
            function: {
              name: "update_crime_report",
              arguments: JSON.stringify({
                evidence: joinedUrls,
                evidenceObservations: joinedObs,
              }),
            },
          };

          console.log("[chat.tsx] handleFileChange => calling functionCallHandler =>", updateCall);
          const resultJson = await functionCallHandler(updateCall);
          console.log("[chat.tsx] functionCallHandler => returned =>", resultJson);

          // (NEW) Wait for the "update_crime_report" run to finish
          console.log("[chat.tsx] handleFileChange => waiting for run to complete after functionCallHandler...");
          await waitForRunToComplete();
          console.log("[chat.tsx] handleFileChange => run completed => next step...");
        }

        // (EXISTING) Wait for any current run to complete before calling notifyGPTOfFileUpload
        console.log("[chat.tsx] handleFileChange => waiting for run to complete before notifyGPTOfFileUpload...");
        await waitForRunToComplete();
        console.log("[chat.tsx] handleFileChange => run completed => now calling notifyGPTOfFileUpload...");

        // Now notify GPT of file uploads in a "user" message
        await notifyGPTOfFileUpload(combinedMessageForGPT);

      } else {
        // Not ok
        const errText = await res.text();
        console.error("[chat.tsx] file upload error =>", errText);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "There was an error uploading your files. Please try again.",
            timestamp: new Date(),
          },
        ]);
        appendLog("assistant", "There was an error uploading your files. Please try again.");
      }
    } catch (err) {
      console.error("[chat.tsx] upload exception =>", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "An unexpected error occurred during file upload.",
          timestamp: new Date(),
        },
      ]);
      appendLog("assistant", "An unexpected error occurred during file upload.");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} text={msg.text} timestamp={msg.timestamp} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Text input */}
      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <input
          type="text"
          className={styles.input}
          placeholder="Describe the incident"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={inputDisabled}
        />

        <button
          type="submit"
          className="button-common"
          disabled={inputDisabled}
        >
          Send
        </button>
      </form>

      {/* File upload */}
      <label className="button-common" style={{ marginTop: "10px" }}>
        Upload Evidence
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
