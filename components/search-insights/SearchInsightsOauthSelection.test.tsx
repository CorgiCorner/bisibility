import {
  renderWithFeatureMessages,
  searchInsightsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsOauthSelection } from "./SearchInsightsOauthSelection";

const polishMessages = structuredClone(searchInsightsFeatureTestMessages);
polishMessages.projectSearchInsights.oauthSelection.gentle = "łagodnym";
polishMessages.projectSearchInsights.oauthSelection.normal = "normalnym";
polishMessages.projectSearchInsights.oauthSelection.importPlan =
  "Importuj {months, number} miesięcy danych w tempie {pace} ({days, number} dni). Około {requests, number} żądań Google, szacowany czas: {duration, number} {durationUnit, select, hours {godzin} days {dni} other {dni}}.";

const setup = {
  accountEmail: "owner@example.com",
  properties: [
    {
      kind: "domain" as const,
      label: "example.com",
      permissionLevel: "siteOwner",
      value: "sc-domain:example.com",
    },
  ],
  provider: "gsc" as const,
};

function renderSelection(syncPlan: SearchSyncPreflightPlan) {
  return renderWithFeatureMessages(
    <SearchInsightsOauthSelection
      onDisconnect={vi.fn()}
      onPropertyChange={vi.fn()}
      onPropertyErrorChange={vi.fn()}
      onSelect={vi.fn()}
      pending={false}
      property="sc-domain:example.com"
      setup={setup}
      switchAccountHref="https://example.com/switch-account"
      syncPlan={syncPlan}
    />,
    { locale: "pl", messages: polishMessages },
  );
}

describe("SearchInsightsOauthSelection", () => {
  it.each([
    [
      "gentle",
      { daysTotal: 93, pace: "gentle", retentionMonths: 3 },
      "łagodnym",
      400,
      17,
      "godzin",
    ],
    [
      "normal",
      { daysTotal: 488, pace: "normal", retentionMonths: 16 },
      "normalnym",
      1900,
      2,
      "dni",
    ],
  ] as const)(
    "keeps the %s import request count and estimated duration in localized copy",
    (_paceName, syncPlan, pace, requests, duration, durationUnit) => {
      renderSelection(syncPlan);
      const number = new Intl.NumberFormat("pl-PL");
      const expected = `Importuj ${number.format(syncPlan.retentionMonths)} miesięcy danych w tempie ${pace} (${number.format(syncPlan.daysTotal)} dni). Około ${number.format(requests)} żądań Google, szacowany czas: ${number.format(duration)} ${durationUnit}.`;

      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});
