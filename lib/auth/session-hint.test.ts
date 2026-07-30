import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeSessionHintFromCookie, sessionHintInitScript } from "./session-hint";

function setHintCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
  document.cookie = `bv_session_hint=${value}; path=/`;
}

describe("session hint", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie cleanup mirrors the browser contract.
    document.cookie = "bv_session_hint=; path=/; max-age=0";
    delete document.documentElement.dataset.authed;
  });

  it("marks the document authenticated before hydration when the hint is set", () => {
    setHintCookie("1");

    initializeSessionHintFromCookie();

    expect(document.documentElement.dataset.authed).toBe("true");
  });

  it("clears a stale marker when the hint cookie is absent or unexpected", () => {
    document.documentElement.dataset.authed = "true";

    initializeSessionHintFromCookie();
    expect(document.documentElement.dataset.authed).toBeUndefined();

    document.documentElement.dataset.authed = "true";
    setHintCookie("0");

    initializeSessionHintFromCookie();
    expect(document.documentElement.dataset.authed).toBeUndefined();
  });

  it("keeps the serialized pre-paint initializer self-contained", () => {
    setHintCookie("1");

    expect(() => runInNewContext(sessionHintInitScript, { document })).not.toThrow();
    expect(document.documentElement.dataset.authed).toBe("true");
  });
});
