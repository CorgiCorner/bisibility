import { describe, expect, it } from "vitest";
import { targetUrlForNewMarketRow } from "./new-row-policy";

describe("targetUrlForNewMarketRow", () => {
  it.each([
    [
      "default market",
      "ES-es",
      "ES-es",
      "https://example.com/pasted",
      "https://example.com/pasted",
    ],
    ["non-default market", "ES-es", "FR-fr", "https://example.com/pasted", null],
    ["missing pasted URL", "ES-es", "ES-es", null, null],
  ])("keeps a pasted URL only for the %s", (_name, defaultKey, rowKey, pastedUrl, expected) => {
    expect(
      targetUrlForNewMarketRow({
        defaultLocationKey: defaultKey,
        pastedUrl,
        rowLocationKey: rowKey,
      }),
    ).toBe(expected);
  });
});
