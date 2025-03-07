"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./chat.module.css";
import { AssistantStream } from "openai/lib/AssistantStream";
import Markdown from "react-markdown";
// @ts-expect-error - no types for this yet
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

/** 
 * Type definitions
 */
type MessageProps = {
  role: "user" | "assistant" | "code";
  text: string;
  timestamp?: Date;
};

type InitialMessage = {
  role: "assistant";
  content: string;
};

type ChatProps = {
  functionCallHandler?: (toolCall: RequiredActionFunctionToolCall) => Promise<string>;
  initialMessages?: InitialMessage[];
};

// USER MESSAGE
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

// ASSISTANT MESSAGE
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

// CODE MESSAGE
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
    case "user":
      return <UserMessage text={text} timestamp={timestamp || new Date()} />;
    case "assistant":
      return <AssistantMessage text={text} timestamp={timestamp || new Date()} />;
    case "code":
      return <CodeMessage text={text} />;
    default:
      return null;
  }
};

/**
 * A helper to POST files to /api/evidence
 */
async function uploadEvidence(files: FileList) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  const res = await fetch("/api/evidence", {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  return data; // { success: boolean, fileUrls: string[] }
}

export default function Chat({
  functionCallHandler = () => Promise.resolve(""),
  initialMessages = [],
}: ChatProps) {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<MessageProps[]>(
    initialMessages.map((msg) => ({
      role: msg.role,
      text: msg.content,
      timestamp: new Date(),
    }))
  );
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");

  // Local state for file attachments
  const [attachFiles, setAttachFiles] = useState<FileList | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Create a new thread on mount
  useEffect(() => {
    const createThread = async () => {
      const res = await fetch(`/api/assistants/threads`, { method: "POST" });
      const data = await res.json();
      setThreadId(data.threadId);
    };
    createThread();
  }, []);

  /**
   * Standard user text message flow
   */
  const sendMessage = async (text: string) => {
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  /**
   * If the AI calls a function, we handle the result
   */
  const submitActionResult = async (runId: string, toolCallOutputs: any) => {
    const response = await fetch(`/api/assistants/threads/${threadId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, toolCallOutputs }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  /**
   * On user text form submit
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: userInput, timestamp: new Date() },
    ]);

    sendMessage(userInput);
    setUserInput("");
    setInputDisabled(true);
  };

  /**
   * On file selection
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachFiles(e.target.files);
    }
  };

  /**
   * On "Upload" click for the chosen files
   */
  const handleUploadEvidence = async () => {
    if (!attachFiles || attachFiles.length === 0) return;
    setInputDisabled(true);

    console.log("🟨 [chat.tsx] handleUploadEvidence => uploading files...");
    const data = await uploadEvidence(attachFiles);
    console.log("🟨 [chat.tsx] handleUploadEvidence =>", data);

    if (!data.success) {
      alert("Evidence upload failed: " + data.error);
      setInputDisabled(false);
      return;
    }

    const evidenceString = data.fileUrls.join(", ");

    // Now call update_crime_report
    const toolCall: RequiredActionFunctionToolCall = {
      function: {
        name: "update_crime_report",
        arguments: JSON.stringify({ evidence: evidenceString }),
      },
    };

    console.log("🟨 [chat.tsx] Updating crime report =>", toolCall);
    await functionCallHandler(toolCall);

    // Insert a user message showing the uploaded evidence
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: `Uploaded evidence: ${evidenceString}`,
        timestamp: new Date(),
      },
    ]);

    alert("Evidence added to the report!");
    setAttachFiles(null);
    setInputDisabled(false);
  };

  /**
   * Streaming events
   */
  const handleTextCreated = () => {
    appendMessage("assistant", "");
  };

  const handleTextDelta = (delta: any) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
    }
  };

  const handleRunCompleted = () => {
    setInputDisabled(false);
  };

  const handleRequiresAction = async (event: AssistantStreamEvent.ThreadRunRequiresAction) => {
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;

    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );

    setInputDisabled(true);
    submitActionResult(runId, toolCallOutputs);
  };

  const handleReadableStream = (stream: AssistantStream) => {
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);
    stream.on("event", (event) => {
      if (event.event === "thread.run.requires_action") handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  };

  /**
   * Utility for streaming messages
   */
  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const updatedLastMessage = { ...lastMessage, text: lastMessage.text + text };
      return [...prev.slice(0, -1), updatedLastMessage];
    });
  };

  const appendMessage = (role: "user" | "assistant" | "code", text: string) => {
    setMessages((prev) => [
      ...prev,
      { role, text, timestamp: new Date() },
    ]);
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, index) => (
          <Message key={index} role={msg.role} text={msg.text} timestamp={msg.timestamp} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* The main chat input row */}
      <form onSubmit={handleSubmit} className={styles.inputForm}>
        {/* A plus icon label referencing the hidden file input */}
        <label htmlFor="attachInput" className={styles.plusButton} title="Attach Evidence">
          {/* The plus icon, e.g. plus-icon.png in /public */}
          <img src="/plus-icon.svg" alt="Attach" style={{ width: 24, height: 24 }} />
        </label>
        <input
          id="attachInput"
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
          disabled={inputDisabled}
        />

        <input
          type="text"
          className={styles.input}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Describe the incident"
          disabled={inputDisabled}
        />

        {/* If user selected files, show an "Upload" button */}
        {attachFiles && attachFiles.length > 0 && (
          <button
            type="button"
            className={styles.button}
            onClick={handleUploadEvidence}
            disabled={inputDisabled}
          >
            Upload
          </button>
        )}

        <button type="submit" className={styles.button} disabled={inputDisabled}>
          Send
        </button>
      </form>
    </div>
  );
}
