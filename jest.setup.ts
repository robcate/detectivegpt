// jest.setup.ts

// 1) Ensures Node sees fetch, etc.
import "openai/shims/node";

// 2) Polyfill fetch, Response, Request, etc.
import "whatwg-fetch";

// 3) Import the default from web-streams-polyfill (v3.3.3)
import streams from "web-streams-polyfill";

// 4) Debug logs to confirm which version we’re using
console.log("[DEBUG] web-streams-polyfill =>", streams);

// 5) Patch globalThis so Node sees a modern, async-iterable ReadableStream
if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = streams.ReadableStream;
}

// Also patch any missing prototypes, just in case:
if (
  !globalThis.ReadableStream.prototype[Symbol.asyncIterator] &&
  typeof streams.ReadableStream.prototype[Symbol.asyncIterator] === "function"
) {
  globalThis.ReadableStream.prototype[Symbol.asyncIterator] =
    streams.ReadableStream.prototype[Symbol.asyncIterator];
}

// 6) If needed, also patch WritableStream and TransformStream
if (!globalThis.WritableStream) {
  globalThis.WritableStream = streams.WritableStream;
}
if (!globalThis.TransformStream) {
  globalThis.TransformStream = streams.TransformStream;
}

// 7) Mock scrollIntoView so jsdom doesn’t crash on it
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}
