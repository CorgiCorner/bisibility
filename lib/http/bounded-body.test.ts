import { describe, expect, it, vi } from "vitest";
import { readBodyWithLimit } from "./bounded-body";

function chunkedRequest(chunks: Uint8Array[], onCancel: () => void, headers?: HeadersInit) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      onCancel();
    },
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
  return new Request("https://example.com/ingest", {
    body,
    // @ts-expect-error - duplex is required by undici for a streaming body.
    duplex: "half",
    headers,
    method: "POST",
  });
}

describe("readBodyWithLimit", () => {
  it("stops reading once the limit is exceeded and cancels the stream", async () => {
    const cancel = vi.fn();
    const chunks = Array.from({ length: 100 }, () => new Uint8Array(1024));
    const request = chunkedRequest(chunks, cancel);

    const result = await readBodyWithLimit(request, 4096);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(cancel).toHaveBeenCalled();
  });

  it("returns the bytes when under the limit", async () => {
    const request = new Request("https://example.com/ingest", {
      body: '{"a":1}',
      method: "POST",
    });

    const result = await readBodyWithLimit(request, 4096);

    expect(result).toEqual({ bytes: Buffer.from('{"a":1}'), ok: true });
  });

  it("rejects early from a content-length above the limit without reading", async () => {
    const cancel = vi.fn();
    const request = chunkedRequest([new Uint8Array(8)], cancel, {
      "content-length": String(1024 * 1024),
    });
    const consumed = vi.fn();
    vi.spyOn(request, "body", "get").mockImplementation(() => {
      consumed();
      return null;
    });

    const result = await readBodyWithLimit(request, 4096);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(consumed).not.toHaveBeenCalled();
  });

  it("treats a missing body as empty", async () => {
    const request = new Request("https://example.com/ingest", { method: "GET" });

    const result = await readBodyWithLimit(request, 4096);

    expect(result).toEqual({ bytes: Buffer.alloc(0), ok: true });
  });

  it("accepts a body that lands exactly on the limit", async () => {
    const cancel = vi.fn();
    const request = chunkedRequest([new Uint8Array(2048), new Uint8Array(2048)], cancel);

    const result = await readBodyWithLimit(request, 4096);

    expect(result).toEqual({ bytes: Buffer.alloc(4096), ok: true });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("reports a stream read failure as unreadable", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("Stream read failed.");
      },
    });
    const request = new Request("https://example.com/ingest", {
      body,
      // @ts-expect-error - duplex is required by undici for a streaming body.
      duplex: "half",
      method: "POST",
    });

    await expect(readBodyWithLimit(request, 4096)).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
