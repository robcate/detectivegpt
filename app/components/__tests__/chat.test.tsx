// chat.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Chat from "../chat";

// 1) Mock the entire react-markdown library
jest.mock("react-markdown", () => {
  const React = require("react");
  return function MockedMarkdown(props: any) {
    return React.createElement("div", { "data-testid": "mocked-md" }, props.children);
  };
});

// 2) Mock the OpenAI AssistantStream so we never call real streaming code
jest.mock("openai/lib/AssistantStream", () => ({
  AssistantStream: {
    fromReadableStream: jest.fn(() => ({
      // Return a dummy stream object with no real streaming
      on: jest.fn(),
    })),
  },
}));

describe("Chat Component (with streaming + react-markdown mocked)", () => {
  beforeEach(() => {
    global.fetch = jest.fn((url, options) => {
      // Simulate thread creation
      if (url.includes("/api/assistants/threads") && options?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ threadId: "test-thread" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      // Simulate sending a message
      if (url.includes("/api/assistants/threads/test-thread/messages") && options?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      // Fallback
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("renders initial message and sends a user message", async () => {
    // Render the Chat component with an initial assistant message
    render(<Chat initialMessages={[{ role: "assistant", content: "Initial message" }]} />);
    
    // Verify the initial assistant message
    expect(screen.getByText("Initial message")).toBeInTheDocument();
    
    // Type and send a user message
    const input = screen.getByPlaceholderText("Describe the incident");
    fireEvent.change(input, { target: { value: "Hello, this is a test" } });
    const sendButton = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendButton);
    
    // Check that the user message appears
    await waitFor(() => {
      expect(screen.getByText("Hello, this is a test")).toBeInTheDocument();
    });
  });
});
