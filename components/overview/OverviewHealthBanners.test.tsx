import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { CheckHealth } from "@/lib/queries/check-health";
import messages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewHealthBanners } from "./OverviewHealthBanners";

function health(latest: NonNullable<CheckHealth["failed24h"]["latest"]>): CheckHealth {
  return {
    budget: { capCents: 1000, exhausted: false, reason: undefined, spentCents: 0 },
    currentFailures: { count: 1, latestCheckId: "chk_example" },
    failed24h: { count: 1, latest },
    providerConnected: true,
    providerRate: { overrideCents: null, providerId: null },
    runningCount: 0,
  };
}

function renderBanners(latest: NonNullable<CheckHealth["failed24h"]["latest"]>) {
  return render(
    <FeatureMessagesProvider
      locale="en"
      messages={mergeMessageCatalogs(sharedMessages, messages)}
      timeZone="UTC"
    >
      <OverviewHealthBanners checkHealth={health(latest)} projectRef="prj_example" />
    </FeatureMessagesProvider>,
  );
}

const latest = {
  checkedAt: "2026-11-01T00:00:00.000Z",
  error: null,
  errorCode: null as string | null,
  keyword: "example keyword",
  provider: "example",
};

describe("overview health banners", () => {
  it("explains unresolved provider links without the generic provider error", () => {
    renderBanners({ ...latest, errorCode: "provider_unresolved_redirects" });
    expect(
      screen.getByText(
        "The provider returned links we could not resolve, so this check has no position.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/retry|charge/i)).toBeNull();
    expect(screen.queryByText(/because of a provider error/)).toBeNull();
  });

  it("explains an unclassifiable organic result instead of the generic provider error", () => {
    renderBanners({
      ...latest,
      error: "example organic payload is indeterminate: organic_result_unclassifiable",
      errorCode: null,
    });
    expect(
      screen.getByText(
        "example keyword: The provider returned a search result we could not classify, so this check has no position.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/because of a provider error/)).toBeNull();
    expect(screen.queryByText(/retry|charge/i)).toBeNull();
  });

  it("accepts the unclassifiable code without reading the free-text error", () => {
    renderBanners({
      ...latest,
      error: null,
      errorCode: "organic_result_unclassifiable",
    });
    expect(
      screen.getByText(
        "example keyword: The provider returned a search result we could not classify, so this check has no position.",
      ),
    ).toBeVisible();
  });

  it("does not treat a longer identifier as an unclassifiable result", () => {
    renderBanners({
      ...latest,
      error: "organic_result_unclassifiable_note",
      errorCode: null,
    });
    expect(screen.getByText(/because of a provider error/)).toBeVisible();
    expect(screen.queryByText(/no position/)).toBeNull();
  });

  it("does not let an anomaly token override a typed provider failure", () => {
    renderBanners({
      ...latest,
      error: "organic_result_unclassifiable",
      errorCode: "provider_billing",
    });
    expect(screen.getByText(/insufficient funds/)).toBeVisible();
    expect(screen.queryByText(/no position/)).toBeNull();
  });
});

it("explains incomplete organic coverage without outage or retry messaging", () => {
  renderBanners({ ...latest, errorCode: "organic_depth_not_covered" });
  expect(screen.getByText(/did not cover the requested depth/)).toBeVisible();
  expect(screen.getByText(/no position or absence could be established/)).toBeVisible();
  expect(screen.queryByText(/temporarily unavailable|try again|retry|not charged/i)).toBeNull();
});
