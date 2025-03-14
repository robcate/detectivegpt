"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./chat.module.css";
import { AssistantStream } from "openai/lib/AssistantStream";
import Markdown from "react-markdown";
// @ts-expect-error (no official types yet)
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

type MessageProps = {
  role: "user" | "assistant" | "code";
  text: string;
  timestamp?: Date;
};

type ChatProps = {
  functionCallHandler?: (toolCall: RequiredActionFunctionToolCall) => Promise<string>;
  initialMessages?: { role: "assistant"; content: string }[];
  /**
   * Called whenever we have a new user or assistant message,
   * so we can store a plain-text conversation log in Page.tsx
   */
  onConversationUpdated?: (fullTextLog: string) => void;
};

// Sub-components for each message type
const UserMessage = ({ text, timestamp }: { text: string; timestamp?: Date }) => (
  <div className={styles.userMessage}>
    <div className={styles.messageContent}>
      {text}
      <div className={styles.timestamp} suppressHydrationWarning>
        {(timestamp || new Date()).toLocaleTimeString()}
      </div>
    </div>
  </div>
);

const AssistantMessage = ({ text, timestamp }: { text: string; timestamp?: Date }) => (
  <div className={styles.assistantMessage}>
    <img className={styles.avatarImage} src="/detective-avatar.png" alt="DetectiveGPT" />
    <div className={styles.messageContent}>
      <Markdown>{text}</Markdown>
      <div className={styles.timestamp} suppressHydrationWarning>
        {(timestamp || new Date()).toLocaleTimeString()}
      </div>
    </div>
  </div>
);

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

const Message = ({ role, text, timestamp }: MessageProps) => {
  switch (role) {
    case "user":      return <UserMessage text={text} timestamp={timestamp} />;
    case "assistant": return <AssistantMessage text={text} timestamp={timestamp} />;
    case "code":      return <CodeMessage text={text} />;
    default:          return null;
  }
};

export default function Chat({
  functionCallHandler = () => Promise.resolve(""),
  initialMessages = [],
  onConversationUpdated = () => {},
}: ChatProps) {
  const [messages, setMessages] = useState<MessageProps[]>([]);
  const [userInput, setUserInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // We'll track a local conversationLog so we can build it as we go
  const conversationLogRef = useRef("");

  // A helper to append lines to conversationLog
  function appendLog(role: "user" | "assistant", text: string) {
    const ts = new Date().toLocaleTimeString();
    conversationLogRef.current += `[${ts}] ${role === "user" ? "User" : "Assistant"}: ${text}\n`;
    onConversationUpdated(conversationLogRef.current);
  }

  // On mount, if we have initialMessages, we add them directly and log them
  useEffect(() => {
    if (initialMessages.length > 0) {
      // We'll set them as the starting messages
      const preloaded = initialMessages.map((m) => ({
        role: m.role,
        text: m.content,
        timestamp: new Date(),
      }));
      setMessages(preloaded);

      // Also log them just once
      preloaded.forEach((msg) => {
        appendLog("assistant", msg.text);
      });
    } else {
      // No initial messages => do the typewriter intro
      setMessages([
        { role: "assistant", text: "", timestamp: new Date() },
      ]);

      // We'll do the typewriter
      let index = 0;
      const INTRO_TEXT = "🚔 GPT is ready to take your statement. Please describe what happened.";
      const interval = setInterval(() => {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (index >= INTRO_TEXT.length) {
            clearInterval(interval);
            // Once fully typed, log it
            appendLog("assistant", last.text + "");
            return prev;
          }
          const updated = { ...last, text: last.text + INTRO_TEXT[index] };
          index++;
          return [...prev.slice(0, -1), updated];
        });
      }, 30);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on each render
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create a new thread on mount
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

  // On user submit
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userInput.trim()) return;

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

  // Handling requires_action => calling functionCallHandler
  async function handleRequiresAction(event: AssistantStreamEvent.ThreadRunRequiresAction) {
    console.log("[chat.tsx] handleRequiresAction => event:", event);
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    console.log("[chat.tsx] toolCalls =>", toolCalls);

    // For each tool call
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall: RequiredActionFunctionToolCall) => {
        console.log("[chat.tsx] handleRequiresAction => calling functionCallHandler =>", toolCall);
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );

    setInputDisabled(true);
    // Now we POST back the results
    const resp = await fetch(`/api/assistants/threads/${threadId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, toolCallOutputs }),
    });
    const stream = AssistantStream.fromReadableStream(resp.body);
    attachStreamListeners(stream);
  }

  // Attach listeners to the assistant response stream
  function attachStreamListeners(stream: AssistantStream) {
    stream.on("textCreated", () => {
      // Insert an empty assistant message if needed
      setMessages((prev) => [...prev, { role: "assistant", text: "", timestamp: new Date() }]);
    });
    stream.on("textDelta", (delta) => {
      if (delta.value) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const updated = { ...last, text: last.text + delta.value };
          return [...prev.slice(0, -1), updated];
        });
      }
    });
    stream.on("event", (event) => {
      console.log("[chat.tsx] Stream event =>", event);
      if (event.event === "thread.run.requires_action") handleRequiresAction(event);
      if (event.event === "thread.run.completed") {
        // Once the final assistant message is done, we can log it
        setInputDisabled(false);
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role === "assistant") {
            appendLog("assistant", last.text);
          }
          return prev;
        });
      }
    });
  }

  // File upload
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;

    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append("files", file));

    console.log("[chat.tsx] Uploading files...", e.target.files);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      console.log("[chat.tsx] File upload => response:", res.status);
      if (res.ok) {
        const { fileUrls, observations } = await res.json();
        fileUrls.forEach((url: string, i: number) => {
          const note = observations[i] || "(No observation)";
          let text = "";
          if (/\.(png|jpe?g|gif|webp)$/i.test(url)) {
            text = `![Uploaded Image](${url})\n\n**Observation:** ${note}`;
          } else {
            text = `**File Uploaded**: [Link](${url})\n**Observation:** ${note}`;
          }
          setMessages((prev) => [...prev, { role: "assistant", text, timestamp: new Date() }]);
          appendLog("assistant", text);
        });
        // Also call update_crime_report
        if (functionCallHandler) {
          const updateCall = {
            function: {
              name: "update_crime_report",
              arguments: JSON.stringify({
                evidence: fileUrls.join(", "),
              }),
            },
          };
          const ret = await functionCallHandler(updateCall);
          console.log("[chat.tsx] fileChange => functionCallHandler =>", ret);
        }
      } else {
        const errText = await res.text();
        console.error("[chat.tsx] File upload error =>", errText);
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
      console.error("[chat.tsx] Upload exception =>", err);
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((m, idx) => (
          <Message key={idx} role={m.role} text={m.text} timestamp={m.timestamp} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Describe the incident"
          disabled={inputDisabled}
        />
        <button type="submit" className={styles.button} disabled={inputDisabled}>
          Send
        </button>
      </form>

      <div className={styles.fileUploadContainer}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
