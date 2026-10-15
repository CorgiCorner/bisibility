import { AccountRouteLoading } from "@/components/account/AccountRouteLoading";
import { IntegrationsPageLoading } from "@/components/integrations/IntegrationsPageLoading";
import { MarketsPageLoading } from "@/components/markets/page/MarketsPageLoading";
import { RunDetailLoading } from "@/components/rank-runs/RunDetailLoading";
import { SchedulePageLoading } from "@/components/schedules/SchedulePageLoading";
import { BusinessSettingsLoading } from "@/components/settings/BusinessSettingsLoading";
import { ExperimentalSettingsLoading } from "@/components/settings/experimental/ExperimentalSettingsLoading";
import { GeneralSettingsRouteLoading } from "@/components/settings/general/GeneralSettingsLoading";
import { settingsSectionGroups } from "@/components/settings/shell/settings-sections";
import { TrackingSettingsRouteLoading } from "@/components/settings/tracking/TrackingSettingsLoading";
import { dataTableRowHeight } from "@/components/ui/data-table/data-table-density";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import account from "@/messages/core/en/account.json";
import schedules from "@/messages/core/en/project-runs-schedules.json";
import settings from "@/messages/core/en/project-settings-shell.json";
import shared from "@/messages/core/en/shared.json";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

function render(ui: ReactElement) {
  return renderWithFeatureMessages(ui, {
    messages: { ...shared, ...settings, ...account, ...schedules },
  });
}
describe("operations route fallback contracts", () => {
  it("reserves the Markets toolbar and standard-density rows without live controls", () => {
    const { container } = render(<MarketsPageLoading />);
    expect(container.querySelector("[data-markets-loading]")).toBeTruthy();
    expect(
      [...container.querySelectorAll<HTMLElement>("[style]")].filter(
        (row) => row.style.height === `${dataTableRowHeight("standard")}px`,
      ),
    ).toHaveLength(3);
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
  it("uses a receipt fallback for a run detail instead of the run list", () => {
    const { container } = render(<RunDetailLoading />);
    expect(container.querySelector("[data-run-detail-loading]")).toBeTruthy();
    expect(
      [...container.querySelectorAll<HTMLElement>("[style]")].filter(
        (row) => row.style.height === `${dataTableRowHeight("compact")}px`,
      ),
    ).toHaveLength(3);
  });
  it("preserves the active integrations panel and does not render a fabricated info card", () => {
    const { container } = render(
      <IntegrationsPageLoading
        connectionsLabel="Page-owned connections"
        usageLabel="Page-owned usage"
        active="usage"
      />,
    );
    expect(container.querySelector("[data-integrations-loading-tabs]")).toHaveTextContent(
      "Page-owned connections",
    );
    expect(container.querySelector('[data-integrations-loading-panel="usage"]')).toBeTruthy();
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
  it("keeps schedule navigation inert while reserving the actual object frame", () => {
    const { container } = render(
      <SchedulePageLoading bodyLabel="Pending editor" breadcrumbLabel="Breadcrumb" />,
    );
    expect(container.querySelector('[aria-busy="true"]')).toHaveClass("grid", "gap-4");
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
  it("reserves search and every grouped settings navigation section", () => {
    const { container } = render(<GeneralSettingsRouteLoading />);
    expect(container.querySelectorAll("[data-settings-loading-group]")).toHaveLength(
      settingsSectionGroups.length,
    );
    expect(
      container.querySelector("[data-settings-loading-subnav] > div > [data-settings-loading-bar]"),
    ).toHaveClass("h-8.5");
    expect(container.querySelector('[data-general-loading-frame="usage-display"]')).toBeTruthy();
  });
  it("matches current Tracking composition without an obsolete Markets card", () => {
    const { container } = render(<TrackingSettingsRouteLoading />);
    expect(
      [...container.querySelectorAll("[data-tracking-loading-frame]")].map((node) =>
        node.getAttribute("data-tracking-loading-frame"),
      ),
    ).toEqual(["measurementPolicy", "measurementSettings", "checkDefaults", "matchScope"]);
  });
  it.each(["locations", "monitors", "monitor"] as const)(
    "uses the business-locations shell for %s",
    (view) => {
      const { container } = render(<BusinessSettingsLoading view={view} />);
      expect(
        container.querySelector('[data-settings-loading-boundary="business-locations"]'),
      ).toBeTruthy();
      expect(container.querySelector(`[data-business-settings-loading="${view}"]`)).toBeTruthy();
    },
  );
  it("uses an Experimental fallback rather than General settings", () => {
    const { container } = render(<ExperimentalSettingsLoading />);
    expect(container.querySelector('[data-settings-loading-boundary="experimental"]')).toBeTruthy();
  });
  it.each(["profile", "preferences", "security"] as const)(
    "keeps %s account fallbacks localized and noninteractive",
    (active) => {
      const { container } = render(<AccountRouteLoading active={active} />);
      expect(container.querySelector(`[data-account-content-loading="${active}"]`)).toBeTruthy();
      expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
      expect(container).not.toHaveTextContent("account.profile.title");
      if (active === "profile") {
        expect(container).toHaveTextContent(account.account.email.title);
        expect(container).toHaveTextContent(account.account.privacy.title);
      }
      if (active === "security")
        expect(container).toHaveTextContent(account.account.security.personalTokens.title);
    },
  );
});
