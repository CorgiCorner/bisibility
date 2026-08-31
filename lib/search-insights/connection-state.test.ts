import { describe, expect, it } from "vitest";
import { resolveSearchInsightsConnectionState } from "./connection-state";

describe("resolveSearchInsightsConnectionState", () => {
  it.each([
    [null, undefined, "not_connected", null],
    ["connected", undefined, "not_connected", null],
    ["connected", "", "connected_no_property", null],
    ["connected", "example.com", "connected", "sc-domain:example.com"],
    ["needs_reauth", "example.com", "needs_reauth", "sc-domain:example.com"],
  ] as const)(
    "maps provider and stored-property facts to canonical connection state",
    (providerStatus, storedProperty, status, propertyKey) => {
      expect(resolveSearchInsightsConnectionState({ providerStatus, storedProperty })).toEqual({
        propertyKey,
        status,
      });
    },
  );
});
