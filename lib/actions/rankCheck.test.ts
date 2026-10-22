import { describe, expect, it, vi } from "vitest";

const manual = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rank-check/manual-run", () => ({ manualRunCheckNow: manual }));

import * as actions from "./rankCheck";

describe("manual rank check action", () => {
  it("delegates only the explicitly requested manual scope", async () => {
    const input = { keywordId: "kw_synthetic" };
    manual.mockResolvedValue({ status: "queued", runId: "rcr_synthetic" });
    expect(await actions.runCheckNow(input)).toEqual({ status: "queued", runId: "rcr_synthetic" });
    expect(manual).toHaveBeenCalledWith(input);
    expect(actions).not.toHaveProperty("queueFirstChecks");
  });
});
