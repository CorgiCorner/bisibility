import { ProviderUsageRow } from "@/components/settings/usage/ProviderUsageRow";
import {
  renderWithUsageSettingsMessages as render,
  renderWithFeatureMessages,
  usageSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const surfaceCopy = usageSettingsFeatureTestMessages.projectSettingsUsage.provider.surface;

const connection = {
  allocation: { amountPerMonth: 3000, unit: "cents" },
  allocationSource: "connection",
  billing: "metered",
  connectionId: "conn_dataforseo",
  credentialSource: "own",
  enabled: true,
  features: [],
  primary: false,
  programmaticAllocation: null,
  projectedExhaustionAt: null,
  provider: "DataForSEO",
  providerId: "dataforseo",
  quotaReset: "none",
  remaining: 2990,
  requestCount: 1,
  unconfirmedCount: 0,
  state: "ok",
  status: "connected",
  own: {
    requestCount: 1,
    surfaces: {
      app: {
        allocation: { amountPerMonth: 3000, unit: "cents" },
        projectedExhaustionAt: null,
        remaining: 2990,
        state: "ok",
        used: 10,
        usedPercent: 0.33,
      },
      programmatic: {
        allocation: null,
        projectedExhaustionAt: null,
        remaining: null,
        state: "no_allocation",
        used: 0,
        usedPercent: null,
      },
    },
    unconfirmedCount: 0,
    unit: "cents",
    used: 10,
    usedPriorMonth: 0,
  },
  credits: {
    requestCount: 0,
    surfaces: {
      app: {
        allocation: null,
        projectedExhaustionAt: null,
        remaining: null,
        state: "no_allocation",
        used: 0,
        usedPercent: null,
      },
      programmatic: {
        allocation: null,
        projectedExhaustionAt: null,
        remaining: null,
        state: "no_allocation",
        used: 0,
        usedPercent: null,
      },
    },
    unconfirmedCount: 0,
    unit: "cents",
    used: 0,
    usedPriorMonth: 0,
  },
  surfaces: {
    app: {
      allocation: { amountPerMonth: 3000, unit: "cents" },
      projectedExhaustionAt: null,
      remaining: 2990,
      state: "ok",
      used: 10,
      usedPercent: 0.33,
    },
    programmatic: {
      allocation: null,
      projectedExhaustionAt: null,
      remaining: null,
      state: "no_allocation",
      used: 0,
      usedPercent: null,
    },
  },
  unit: "cents",
  used: 10,
  usedPercent: 0.33,
  usedPriorMonth: 0,
} satisfies ProviderSpendConnection;

describe("ProviderUsageRow", () => {
  it("shows stale reconciliation beside the meter, including when details are collapsed", () => {
    render(
      <ProviderUsageRow
        connection={{ ...connection, reconciliation: { status: "stale", lastReconciledAt: null } }}
        now="2026-09-22T12:00:00.000Z"
      />,
    );
    const notice = screen.getByText(
      "Usage reconciliation is delayed. Displayed totals may be incomplete.",
    );
    expect(notice.closest("summary")).not.toBeNull();
    expect(screen.getByText("Usage may take up to 15 minutes to update.")).toBeInTheDocument();
  });
  it("renders source and scheduled chips from the per-feature breakdown", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          features: [
            {
              bySource: [
                { count: 2, costCents: 4, scheduled: 1, source: "app" },
                { count: 1, costCents: 6, scheduled: 0, source: "api" },
                { count: 3, costCents: 9, scheduled: 2, source: "worker" },
              ],
              costCents: 19,
              count: 6,
              feature: "rank_check",
              label: "Rank checks",
            },
          ],
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );

    expect(screen.getByText("App 5")).toBeInTheDocument();
    expect(screen.getByText("API 1")).toBeInTheDocument();
    expect(screen.getByText("Scheduled: 3")).toBeInTheDocument();
    expect(screen.queryByText("SDK 1")).not.toBeInTheDocument();
  });

  it("shows native searches instead of USD for quota connections, with unconfirmed coverage", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          allocation: { amountPerMonth: 100, unit: "units" },
          billing: "quota",
          unit: "units",
          unconfirmedCount: 2,
          used: 5,
          surfaces: {
            ...connection.surfaces,
            app: {
              ...connection.surfaces.app,
              allocation: { amountPerMonth: 100, unit: "units" },
              used: 5,
              unconfirmedCount: 2,
              remaining: 95,
              usedPercent: 5,
            },
          },
          own: {
            ...connection.own,
            unit: "units",
            unconfirmedCount: 2,
            used: 5,
            surfaces: {
              ...connection.own.surfaces,
              app: {
                ...connection.own.surfaces.app,
                allocation: { amountPerMonth: 100, unit: "units" },
                used: 5,
                unconfirmedCount: 2,
                remaining: 95,
                usedPercent: 5,
              },
            },
          },
          features: [
            {
              bySource: [{ count: 2, costCents: 0, scheduled: 1, source: "app" }],
              checksCount: 4,
              costCents: 0,
              count: 2,
              feature: "rank_check",
              label: "Rank checks",
              quantity: 3,
              unconfirmedCount: 2,
            },
          ],
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );

    expect(screen.getByText("2 - 3 searches")).toBeInTheDocument();
    expect(screen.getByText("Unconfirmed requests: 2")).toBeInTheDocument();
    expect(screen.getByText("Checks: 4")).toBeInTheDocument();
    expect(
      screen.getByText("At least 5 of 100 searches used · Unconfirmed requests: 2"),
    ).toBeInTheDocument();
    expect(screen.getByText("Usage may take up to 15 minutes to update.")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("never presents a zero confirmed meter as final while requests are unconfirmed", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          unconfirmedCount: 3,
          used: 0,
          surfaces: {
            ...connection.surfaces,
            app: {
              ...connection.surfaces.app,
              used: 0,
              unconfirmedCount: 3,
              remaining: 3000,
              usedPercent: 0,
            },
          },
          own: {
            ...connection.own,
            unconfirmedCount: 3,
            used: 0,
            surfaces: {
              ...connection.own.surfaces,
              app: {
                ...connection.own.surfaces.app,
                used: 0,
                unconfirmedCount: 3,
                remaining: 3000,
                usedPercent: 0,
              },
            },
          },
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );

    expect(
      screen.getByText("At least $0.00 of $30.00 used · Unconfirmed requests: 3"),
    ).toBeInTheDocument();
  });

  it("shows the API and agents budget even when only the app budget has a cap", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          allocation: { amountPerMonth: 100, unit: "cents" },
          remaining: 0,
          state: "capped",
          used: 100,
          usedPercent: 100,
          surfaces: {
            ...connection.surfaces,
            app: {
              allocation: { amountPerMonth: 100, unit: "cents" },
              projectedExhaustionAt: null,
              remaining: 0,
              state: "capped",
              used: 100,
              usedPercent: 100,
            },
          },
          own: {
            ...connection.own,
            surfaces: {
              ...connection.own.surfaces,
              app: {
                allocation: { amountPerMonth: 100, unit: "cents" },
                projectedExhaustionAt: null,
                remaining: 0,
                state: "capped",
                used: 100,
                usedPercent: 100,
              },
            },
          },
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );

    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText("$1.00 of $1.00 used")).toBeInTheDocument();
    expect(screen.getByText(surfaceCopy.app)).toBeInTheDocument();
    expect(screen.getByText(surfaceCopy.programmatic)).toBeInTheDocument();
  });

  it("renders two labelled mini bars when both surfaces have a cap or usage", () => {
    render(
      <ProviderUsageRow
        connection={{
          ...connection,
          programmaticAllocation: { amountPerMonth: 2000, unit: "cents" },
          surfaces: {
            ...connection.surfaces,
            programmatic: {
              allocation: { amountPerMonth: 2000, unit: "cents" },
              projectedExhaustionAt: null,
              remaining: 1960,
              state: "ok",
              used: 40,
              usedPercent: 2,
            },
          },
          own: {
            ...connection.own,
            surfaces: {
              ...connection.own.surfaces,
              programmatic: {
                allocation: { amountPerMonth: 2000, unit: "cents" },
                projectedExhaustionAt: null,
                remaining: 1960,
                state: "ok",
                used: 40,
                usedPercent: 2,
              },
            },
          },
        }}
        now="2026-08-24T17:03:00.000Z"
      />,
    );

    expect(screen.getAllByRole("meter")).toHaveLength(2);
    expect(screen.getByText(surfaceCopy.app)).toBeInTheDocument();
    expect(screen.getByText(surfaceCopy.programmatic)).toBeInTheDocument();
    expect(screen.getByText("$0.10 of $30.00 used")).toBeInTheDocument();
    expect(screen.getByText("$0.40 of $20.00 used")).toBeInTheDocument();
  });

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
                bySource: [],
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
