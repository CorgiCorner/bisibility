import { gunzipSync } from "node:zlib";
import type { Prisma } from "@/lib/generated/prisma/client";
import { decryptSecret } from "@/lib/providers/crypto";
import { describe, expect, it, vi } from "vitest";
import { captureResponseObserver } from "./observer";
import { storeProviderResponse } from "./store";

const scope = {
  projectId: "project",
  connectionId: "connection",
  provider: "fixture",
  feature: "research",
  operationId: "operation",
};
function database(events: string[] = []) {
  const create = vi.fn(
    async (_input: { data: Prisma.ProviderResponseCaptureUncheckedCreateInput }) => {
      events.push("archive");
      return {};
    },
  );
  return { db: { providerResponseCapture: { create } } as never, create };
}
describe("native provider response archive", () => {
  it("encrypts the complete redacted body and binds it to its project and operation", async () => {
    const { db, create } = database();
    const body = {
      api_key: "secret",
      rows: [{ id: 1, detail: { text: "kept" } }],
      metadata: { total: 19 },
    };
    await storeProviderResponse(
      scope,
      { status: 200, body, url: "https://example.com/?api_key=secret", attemptId: "attempt" },
      db,
    );
    const data = create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      ...scope,
      httpStatus: 200,
      attemptId: "attempt",
    });
    expect(data.payloadEncrypted).not.toContain("kept");
    const saved = JSON.parse(
      gunzipSync(Buffer.from(decryptSecret(data.payloadEncrypted), "base64")).toString(),
    );
    expect(saved).toEqual({ ...body, api_key: "[redacted]" });
    expect(data.requestUrl).not.toContain("secret");
    expect(body.api_key).toBe("secret");
  });
  it("archives success and provider failures after their usage receipt settles", async () => {
    for (const status of [200, 429, 500]) {
      const events: string[] = [];
      const { db, create } = database(events);
      const base = {
        begin: vi.fn(async () => "attempt"),
        settle: vi.fn(async () => {
          events.push("settled");
        }),
      };
      const observer = captureResponseObserver(base, scope, db);
      await observer.observeResponse?.(status, { message: "original response" }, "attempt");
      expect(create).not.toHaveBeenCalled();
      await observer.settle("attempt", {
        costCents: 0,
        quantity: 1,
        cached: false,
        failed: status !== 200,
      });
      expect(events).toEqual(["settled", "archive"]);
      expect(create.mock.calls[0]?.[0].data.httpStatus).toBe(status);
    }
  });
  it("retains a response even if receipt settlement fails, without hiding that failure", async () => {
    const { db, create } = database();
    const failure = new Error("settlement failed");
    const observer = captureResponseObserver(
      {
        begin: vi.fn(async () => "a"),
        settle: vi.fn(async () => {
          throw failure;
        }),
      },
      scope,
      db,
    );
    await observer.observeResponse?.(200, { kept: true }, "a");
    await expect(
      observer.settle("a", { costCents: null, quantity: null, cached: false, failed: false }),
    ).rejects.toBe(failure);
    expect(create).toHaveBeenCalledOnce();
  });
});
