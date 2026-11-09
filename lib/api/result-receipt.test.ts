import { beforeEach, expect, it, vi } from "vitest";

const record = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: record }));

import { recordApiResultReceipt } from "./result-receipt";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => record.mockReset());
it.each([false, true])(
  "records the authenticated response with mcp=%s without consuming it",
  async (mcp) => {
    const response = Response.json({
      data: { status: "completed", position: null, checked_at: "2026-11-05" },
    });
    recordApiResultReceipt(response, "person", mcp);
    await flush();
    expect(record).toHaveBeenCalledWith({
      userId: "person",
      surface: mcp ? "mcp" : "api",
      nonEmpty: true,
    });
    expect((await response.json()).data.status).toBe("completed");
  },
);
it("ignores failed and unattributable responses", async () => {
  recordApiResultReceipt(Response.json({ status: "completed" }, { status: 403 }), "person", false);
  recordApiResultReceipt(Response.json({ status: "completed" }), null, false);
  await flush();
  expect(record).not.toHaveBeenCalled();
});

it("does not fail a response whose body cannot be cloned", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = Response.json({ data: {} });
  vi.spyOn(response, "clone").mockImplementation(() => {
    throw new Error("used");
  });
  expect(() => recordApiResultReceipt(response, "person", false)).not.toThrow();
});
