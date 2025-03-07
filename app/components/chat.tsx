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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom on each render
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages]);

  // Create a new thread on mount
  useEffect(() => {
    const createThread = async () => {
      console.log("🟨 [chat.tsx] Creating new thread...");
      const res = await fetch(`/api/assistants/threads`, { method: "POST" });
      const data = await res.json();
      console.log("🟨 [chat.tsx] Created thread =>", data.threadId);
      setThreadId(data.threadId);
    };
    createThread();
  }, []);

  // Send user message
  const sendMessage = async (text: string) => {
    console.log("🟨 [chat.tsx] sendMessage =>", text);
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  // Submit function call results
  const submitActionResult = async (runId: string, toolCallOutputs: any) => {
    console.log("🟨 [chat.tsx] submitActionResult => runId:", runId, "toolCallOutputs:", toolCallOutputs);
    const response = await fetch(`/api/assistants/threads/${threadId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, toolCallOutputs }),
    });
    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  // On form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    // Add user message to state
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userInput, timestamp: new Date() },
    ]);

    sendMessage(userInput);
    setUserInput("");
    setInputDisabled(true);
  };

  // Stream event handlers
  const handleTextCreated = () => {
    console.log("🟨 [chat.tsx] handleTextCreated => creating new assistant message...");
    appendMessage("assistant", "");
  };

  const handleTextDelta = (delta: any) => {
    if (delta.value != null) {
      console.log("🟨 [chat.tsx] handleTextDelta => appending:", delta.value);
      appendToLastMessage(delta.value);
    }
  };

  const handleRunCompleted = () => {
    console.log("🟨 [chat.tsx] handleRunCompleted => enabling input");
    setInputDisabled(false);
  };

  const handleRequiresAction = async (event: AssistantStreamEvent.ThreadRunRequiresAction) => {
    console.log("🟨 [chat.tsx] handleRequiresAction =>", event);
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    console.log("🟨 [chat.tsx] toolCalls =>", toolCalls);

    // For each tool call, call functionCallHandler
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        console.log("🟨 [chat.tsx] calling functionCallHandler => toolCall:", toolCall);
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );

    setInputDisabled(true);
    submitActionResult(runId, toolCallOutputs);
  };

  // Attach stream listeners
  const handleReadableStream = (stream: AssistantStream) => {
    console.log("🟨 [chat.tsx] handleReadableStream => attaching listeners...");
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);
    stream.on("event", (event) => {
      console.log("🟨 [chat.tsx] event =>", event);
      if (event.event === "thread.run.requires_action") handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  };

  // Helper to append text to the last message
  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const updated = { ...last, text: last.text + text };
      return [...prev.slice(0, -1), updated];
    });
  };

  // Helper to append a new message
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
      <form onSubmit={handleSubmit} className={styles.inputForm}>
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
    </div>
  );
}
