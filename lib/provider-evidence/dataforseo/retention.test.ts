import { expect, it } from "vitest";
import { metadataWindow, resultRetention } from "./retention";

it("uses a calendar month for metadata and 30 days for results", () => {
  const now = new Date("2026-03-31T12:00:00Z");
  expect(metadataWindow("2026-02-28T12:00:00Z", "2026-03-01T12:00:00Z", now)).toMatchObject({
    kind: "finally_unknown",
    retryable: false,
    suggestedBackoffMs: null,
  });
  expect(metadataWindow("2026-02-28T12:00:01Z", "2026-03-01T12:00:00Z", now)).toBeNull();
  expect(resultRetention("2026-03-01T12:00:00Z", now)).toMatchObject({ kind: "finally_unknown" });
  expect(resultRetention("2026-03-01T12:00:01Z", now)).toBeNull();
});
