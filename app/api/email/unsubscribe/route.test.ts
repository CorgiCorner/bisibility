import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ unsubscribe: vi.fn() }));

vi.mock("@/lib/email/marketing-unsubscribe", () => ({
  unsubscribeFromMarketingEmails: mocks.unsubscribe,
}));

function request(body: unknown) {
  return new Request("https://app.example.com/api/email/unsubscribe", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function oversizedRequest() {
  let count = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (count >= 5) {
        controller.close();
        return;
      }
      count += 1;
      controller.enqueue(new Uint8Array(1024));
    },
  });
  return new Request("https://app.example.com/api/email/unsubscribe", {
    body,
    // @ts-expect-error - duplex is required by undici for a streaming body.
    duplex: "half",
    method: "POST",
  });
}

function unreadableRequest() {
  const body = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error("Stream read failed.");
    },
  });
  return new Request("https://app.example.com/api/email/unsubscribe", {
    body,
    // @ts-expect-error - duplex is required by undici for a streaming body.
    duplex: "half",
    method: "POST",
  });
}

describe("POST /api/email/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unsubscribe.mockResolvedValue(true);
  });

  it("records a valid signed preference change", async () => {
    const response = await POST(request({ token: "signed-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.unsubscribe).toHaveBeenCalledWith("signed-token");
  });

  it("rejects malformed or unverifiable tokens", async () => {
    expect((await POST(request({ token: "" }))).status).toBe(400);
    mocks.unsubscribe.mockResolvedValue(false);
    expect((await POST(request({ token: "tampered" }))).status).toBe(400);
  });

  it("refuses an oversized streamed body before validating a token", async () => {
    const response = await POST(oversizedRequest());

    expect(response.status).toBe(413);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });

  it("rejects an unreadable streamed body before validating a token", async () => {
    const response = await POST(unreadableRequest());

    expect(response.status).toBe(400);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });
});
