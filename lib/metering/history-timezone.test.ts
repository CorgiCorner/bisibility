import { expect, test, vi } from "vitest";
import { historicalOperation } from "./history-mapping";
import { source } from "./history-test-data";

test.each(["Europe/Warsaw", "America/Los_Angeles"])(
  "legacy UTC timestamp keeps its billing month in %s",
  (timezone) => {
    vi.stubEnv("TZ", timezone);
    try {
      const operation = historicalOperation(
        source({ createdAt: "2026-09-01T00:00:00" }),
        "test",
        "2026-10-11T00:00:00Z",
      );
      expect(operation.createdAt).toBe("2026-09-01T00:00:00.000Z");
      expect(operation.receipts[0].occurredAt).toBe(operation.createdAt);
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
