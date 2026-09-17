import { ProviderUsageRow } from "@/components/settings/usage/ProviderUsageRow";
import {
  renderWithUsageSettingsMessages as render,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { screen } from "@testing-library/react";
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

  it("uses explicit Polish state and feature labels without translating provider data", () => {
    const messages = structuredClone(usageSettingsFeatureTestMessages);
    const provider = messages.projectSettingsUsage.provider;
    provider.status.ok = "połączono";
    provider.status.capped = "limit wykorzystany";
    provider.status.fallback_active = "aktywne przełączenie";
    provider.status.top_up_required = "wymagane doładowanie";
    provider.status.no_allocation = "brak budżetu";
    provider.featureLabel.backlinks = "Linki zwrotne";
    provider.featureLabel.domainOverview = "Przegląd domeny";
    provider.featureLabel.keywordMetrics = "Metryki słów kluczowych";
    provider.featureLabel.keywordResearch = "Badanie słów kluczowych";
    provider.featureLabel.rankCheck = "Kontrole pozycji";
    provider.featureLabel.rankedKeywords = "Słowa kluczowe w rankingu";
    const states = ["ok", "capped", "fallback_active", "top_up_required", "no_allocation"] as const;
    const features = [
      "backlinks",
      "domain_overview",
      "keyword_metrics",
      "keyword_research",
      "rank_check",
      "ranked_keywords",
    ] as const;

    renderWithFeatureMessages(
      <ul>
        {states.map((state, index) => (
          <ProviderUsageRow
            connection={{
              ...connection,
              connectionId: `conn_${state}`,
              features: features.map((feature) => ({
                costCents: index + 1,
                count: index + 1,
                feature,
                label: `English ${feature}`,
              })),
              provider: `Provider ${index + 1}`,
              state,
            }}
            key={state}
            now="2026-08-24T17:03:00.000Z"
          />
        ))}
      </ul>,
      { locale: "pl", messages },
    );

    for (const label of [
      "połączono",
      "limit wykorzystany",
      "aktywne przełączenie",
      "wymagane doładowanie",
      "brak budżetu",
      "Linki zwrotne",
      "Przegląd domeny",
      "Metryki słów kluczowych",
      "Badanie słów kluczowych",
      "Kontrole pozycji",
      "Słowa kluczowe w rankingu",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("English rank_check")).toBeNull();
    expect(screen.getByText("Provider 1")).toBeInTheDocument();
  });
});
