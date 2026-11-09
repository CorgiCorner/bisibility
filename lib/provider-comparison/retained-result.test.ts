import { expect, it } from "vitest";
import { publicComparisonResult } from "./retained-result";

it("never sends stored native fragments or internal check IDs to the client", () => {
  expect(
    publicComparisonResult({
      results: [],
      _capture: { token: "private" },
      _sourceCheckId: "internal",
      _savedCheckRef: "public",
    }),
  ).toEqual({ results: [] });
});
