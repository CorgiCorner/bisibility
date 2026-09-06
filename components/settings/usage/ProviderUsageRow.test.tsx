import { ProviderUsageRow } from "@/components/settings/usage/ProviderUsageRow";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const connection = {
  allocation: { amountPerMonth: 3000, unit: "cents" },
  allocationSource: "connection",
  billing: "metered",
  connectionId: "conn_dataforseo",
  enabled: true,
  features: [],
  primary: false,
  projectedExhaustionAt: null,
  provider: "DataForSEO",
  providerId: "dataforseo",
  quotaReset: "none",
  remaining: 2990,
  requestCount: 1,
  state: "ok",
  status: "connected",
  unit: "cents",
  used: 10,
  usedPercent: 0.33,
  usedPriorMonth: 0,
} satisfies ProviderSpendConnection;

describe("ProviderUsageRow", () => {
  it("uses the shared relative formatter with the supplied reference time", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          availableAtProvider: {
            amount: 12.4,
            checkedAt: "2026-08-24T16:57:00.000Z",
            status: "available",
            unit: "usd",
          },
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );
    expect(screen.getByText("Balance $12.40 (6m ago) · does not expire")).toBeInTheDocument();
  });

  it.each([
    ["unreachable", "Could not reach provider"],
    ["reconnect_required", "Reconnect required"],
  ] as const)("renders %s availability distinctly", (status, copy) => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          availableAtProvider: { checkedAt: "2026-08-24T16:57:00.000Z", status },
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText("Availability unavailable")).not.toBeInTheDocument();
  });
});
