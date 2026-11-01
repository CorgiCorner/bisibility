import { describe, expect, it } from "vitest";
import { isInjectedScriptEvent } from "./injected-script-event";

describe("injected script events", () => {
  it.each([
    "app:///frame_ant/frame_ant.js",
    "chrome-extension://abc/script.js",
    "moz-extension://abc/script.js",
    "safari-extension://abc/script.js",
    "safari-web-extension://abc/script.js",
  ])("detects a frame from %s in any exception", (filename) => {
    expect(
      isInjectedScriptEvent({
        exception: { values: [{}, { stacktrace: { frames: [{ filename }] } }] },
      }),
    ).toBe(true);
  });
  it("keeps application frames, similar paths and missing stacks", () => {
    for (const event of [
      {},
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  { filename: "https://example.com/frame_ant/frame_ant.js" },
                  { filename: "/_next/static/main.js" },
                ],
              },
            },
          ],
        },
      },
    ]) {
      expect(isInjectedScriptEvent(event)).toBe(false);
    }
  });
});
