import { describe, expect, it } from "vitest";
import {
  authorizeQueuedRankCheckBatchActivity,
  authorizeRankCheckExecutionActivity,
} from "./activities";

describe("Temporal D1 activity registry", () => {
  it("registers both mode authorization activities in the worker barrel", () => {
    expect(authorizeRankCheckExecutionActivity).toBeTypeOf("function");
    expect(authorizeQueuedRankCheckBatchActivity).toBeTypeOf("function");
  });
});
