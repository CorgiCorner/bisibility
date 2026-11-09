import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const close = vi.hoisted(() => vi.fn());
vi.mock("./site-audit-intent-dispatch", () => ({
  startSiteAuditIntentProcessor: () => ({ close }),
}));
it("keeps the worker entrypoint within the 300-line production limit", () => {
  expect(
    readFileSync(new URL("./worker.ts", import.meta.url), "utf8")
      .trimEnd()
      .split("\n").length,
  ).toBeLessThanOrEqual(300);
});
it.each([false, true])(
  "drains the intent processor when the worker exits (failure=%s)",
  async (failure) => {
    close.mockClear();
    const { withSiteAuditIntentProcessor } = await import("./site-audit-runtime");
    const work = async () => {
      if (failure) throw new Error("worker failed");
    };
    if (failure) await expect(withSiteAuditIntentProcessor(work)).rejects.toThrow("worker failed");
    else await withSiteAuditIntentProcessor(work);
    expect(close).toHaveBeenCalledTimes(1);
  },
);
