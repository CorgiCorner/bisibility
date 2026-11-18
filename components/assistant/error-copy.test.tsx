import { ASSISTANT_ERROR_CODES } from "@/lib/assistant/wire";
import catalog from "@/messages/core/en/assistant.json";
import { describe, expect, it } from "vitest";

describe("assistant error copy", () => {
  it("has a distinct message for every wire error", () => {
    const messages = ASSISTANT_ERROR_CODES.map((code) => catalog.assistant.errors[code]);
    expect(messages.every((message) => typeof message === "string" && message.length > 0)).toBe(
      true,
    );
    expect(new Set(messages).size).toBe(ASSISTANT_ERROR_CODES.length);
  });
});
