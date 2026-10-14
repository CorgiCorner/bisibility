import { monitorPreviewSchema } from "@/lib/local-monitor-launch/input-schema";
import { describe, expect, it } from "vitest";

const request = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  monitorId: "lmn_abcdefghijklmnopqrstuvwx",
  expectedVersion: 1,
  connectionId: "conn_abcdefghijklmnopqrstuvwx",
  idempotencyKey: "new-explicit-retry",
  retry: {
    parentRunId: "lmr_abcdefghijklmnopqrstuvwx",
    targetIds: ["lmt_abcdefghijklmnopqrstuvwx"],
  },
};
describe("explicit paid retry of original failed targets", () => {
  it("admits a valid selected-original-target preview command instead of forcing a new Cartesian scan", () => {
    const parsed = monitorPreviewSchema.safeParse(request);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data).toEqual(request);
  });
  it.each([
    { parentRunId: "foreign", targetIds: request.retry.targetIds },
    { ...request.retry, targetIds: [] },
    { ...request.retry, targetIds: ["foreign"] },
    { ...request.retry, targetIds: [...request.retry.targetIds, ...request.retry.targetIds] },
  ])("refuses malformed, empty or duplicate original selections", (retry) => {
    expect(monitorPreviewSchema.safeParse({ ...request, retry }).success).toBe(false);
  });
});
