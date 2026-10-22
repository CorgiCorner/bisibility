import { describe, expect, it } from "vitest";
import { providerSourceChangeFor } from "./audit-event-details";

describe("providerSourceChangeFor", () => {
  it("retains only a known provider name and funding source", () => {
    expect(
      providerSourceChangeFor("provider.credential_source_changed", {
        provider: "dataforseo",
        source: "hosted",
        secret: "never render this",
      }),
    ).toEqual({ provider: "DataForSEO", source: "hosted" });
  });

  it.each([
    null,
    { provider: "unexpected-secret", source: "own" },
    { provider: "dataforseo", source: "unexpected-secret" },
  ])("declines invalid or unrecognized structured details: %j", (after) => {
    expect(providerSourceChangeFor("provider.credential_source_changed", after)).toBeUndefined();
  });
});
