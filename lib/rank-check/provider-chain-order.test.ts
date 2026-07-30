import { describe, expect, it } from "vitest";
import { primaryProviderConnection } from "./provider-chain-order";

function connection(
  provider: string,
  priority: number,
  overrides: Partial<{
    enabled: boolean;
    kind: "analytics" | "serp";
    status: string;
  }> = {},
) {
  return {
    enabled: true,
    kind: "serp" as const,
    priority,
    provider,
    status: "connected",
    ...overrides,
  };
}

describe("provider chain order", () => {
  it("selects the lowest eligible priority and breaks ties by provider id", () => {
    const primary = primaryProviderConnection(
      [
        connection("serpapi", 0),
        connection("dataforseo", 0),
        connection("disabled", -1, { enabled: false }),
        connection("unhealthy", -2, { status: "needs_reauth" }),
        connection("analytics", -3, { kind: "analytics" }),
      ],
      "serp",
    );

    expect(primary?.provider).toBe("dataforseo");
  });

  it("returns no primary when no connection is eligible", () => {
    expect(
      primaryProviderConnection(
        [
          connection("disabled", 0, { enabled: false }),
          connection("unhealthy", 1, { status: "needs_reauth" }),
        ],
        "serp",
      ),
    ).toBeNull();
  });
});
