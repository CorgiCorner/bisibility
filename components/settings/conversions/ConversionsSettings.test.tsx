import { ConversionsSettings } from "@/components/settings/conversions/ConversionsSettings";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type {
  ConversionActionResult,
  ConversionSource,
  ConversionsSettingsModel,
} from "@/lib/conversions/types";
import projectSettingsConversions from "@/messages/core/en/project-settings-conversions.json";
import projectSettingsShell from "@/messages/core/en/project-settings-shell.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const messages = mergeMessageCatalogs(shared, projectSettingsShell, projectSettingsConversions);

function model(options: {
  goals?: ConversionsSettingsModel["goals"];
  plausibleConnected?: boolean;
  ga4Connected?: boolean;
}): ConversionsSettingsModel {
  const ga4Connected = options.ga4Connected ?? true;
  const plausibleConnected = options.plausibleConnected ?? true;
  const sources = [
    {
      connected: ga4Connected,
      conversions28: ga4Connected ? 12 : 0,
      label: "Google Analytics 4",
      lastDay: ga4Connected ? "2026-03-28" : null,
      logoDomain: "google.com",
      primary: ga4Connected,
      reportsRevenue: false,
      source: "ga4" as const,
    },
    {
      connected: plausibleConnected,
      conversions28: plausibleConnected ? 4 : 0,
      label: "Plausible",
      lastDay: plausibleConnected ? "2026-03-28" : null,
      logoDomain: "plausible.io",
      primary: false,
      reportsRevenue: false,
      source: "plausible" as const,
    },
  ];
  return {
    comparison: [
      {
        cells: [
          { count: 12, currency: null, revenueMinor: null, source: "ga4" },
          { count: null, currency: null, revenueMinor: null, source: "plausible" },
        ],
        displayName: "Key events",
      },
      {
        cells: [
          { count: null, currency: null, revenueMinor: null, source: "ga4" },
          { count: 4, currency: "USD", revenueMinor: "100", source: "plausible" },
        ],
        displayName: "Signup",
      },
    ],
    goals: options.goals ?? [
      {
        countsRevenue: false,
        displayName: "Key events",
        enabled: true,
        id: "goal_ga4",
        last28: 12,
        reportsRevenue: false,
        source: "ga4",
        sourceLabel: "Google Analytics 4",
        sourceName: "key_events",
      },
      {
        countsRevenue: false,
        displayName: "Signup",
        enabled: false,
        id: "goal_signup",
        last28: 4,
        reportsRevenue: true,
        source: "plausible",
        sourceLabel: "Plausible",
        sourceName: "Signup",
      },
    ],
    primary: ga4Connected ? "ga4" : null,
    showComparison: ga4Connected && plausibleConnected,
    sources,
  };
}

type SetPrimary = (input: {
  projectId: string;
  source: ConversionSource;
}) => Promise<ConversionActionResult>;
type SyncSource = SetPrimary;
type UpdateGoal = (input: {
  countsRevenue?: boolean;
  displayName?: string;
  enabled?: boolean;
  goalId: string;
  projectId: string;
}) => Promise<ConversionActionResult>;

function renderSettings(
  value: ConversionsSettingsModel,
  actions?: { setPrimary?: SetPrimary; syncSource?: SyncSource; updateGoal?: UpdateGoal },
) {
  const setPrimary = actions?.setPrimary ?? vi.fn<SetPrimary>().mockResolvedValue({ ok: true });
  const syncSource = actions?.syncSource ?? vi.fn<SyncSource>().mockResolvedValue({ ok: true });
  const updateGoal = actions?.updateGoal ?? vi.fn<UpdateGoal>().mockResolvedValue({ ok: true });
  const rendered = renderWithFeatureMessages(
    <ConversionsSettings
      actions={{ setPrimary, syncSource, updateGoal }}
      canEdit
      connectHref="/app/prj_1/settings/data-sources"
      model={value}
      projectId="prj_1"
    />,
    { messages },
  );
  return { setPrimary, syncSource, updateGoal, ...rendered };
}

describe("ConversionsSettings", () => {
  it("shows both sources, the side-by-side table, and a disabled goal", () => {
    renderSettings(model({}));
    expect(screen.getByText("GA4 reports all key events together.")).toBeInTheDocument();
    expect(document.querySelector("[data-conversions-blocks]")).toHaveAttribute(
      "data-conversions-blocks",
      "intro sources goals",
    );
    expect(
      screen.getByText("Organic search goal conversions, one daily count per landing page."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sync now" })).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Conversions by source" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Google Analytics 4 (Primary)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
    const signup = document.querySelector('[data-conversion-goal="goal_signup"]');
    if (!(signup instanceof HTMLElement)) throw new Error("missing goal");
    expect(within(signup).getByRole("switch", { name: "Enabled" })).not.toBeChecked();
    expect(within(signup).getByRole("switch", { name: "Counts revenue" })).toBeInTheDocument();
  });

  it("hides the comparison when only one source is connected", () => {
    renderSettings(model({ plausibleConnected: false }));
    expect(screen.queryByRole("table", { name: "Conversions by source" })).toBeNull();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "/app/prj_1/settings/data-sources",
    );
  });

  it("shows an empty goal list when no source has reported one", () => {
    renderSettings(model({ ga4Connected: false, goals: [], plausibleConnected: false }));
    expect(screen.getByText("No conversions yet")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("confirms a primary change and refreshes", async () => {
    const user = userEvent.setup();
    const setPrimary = vi.fn<SetPrimary>().mockResolvedValue({ ok: true });
    renderSettings(model({}), { setPrimary });
    await user.click(screen.getByRole("radio", { name: "Primary source: Plausible" }));
    await user.click(screen.getByRole("button", { name: "Change primary source" }));
    expect(setPrimary).toHaveBeenCalledWith({ projectId: "prj_1", source: "plausible" });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("syncs one connected source", async () => {
    const user = userEvent.setup();
    const syncSource = vi.fn<SyncSource>().mockResolvedValue({ ok: true });
    renderSettings(model({}), { syncSource });
    const plausible = document.querySelector('[data-conversion-source="plausible"]');
    if (!(plausible instanceof HTMLElement)) throw new Error("missing source");
    await user.click(within(plausible).getByRole("button", { name: "Sync now" }));
    expect(syncSource).toHaveBeenCalledWith({ projectId: "prj_1", source: "plausible" });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("saves a display name and an enabled switch", async () => {
    const user = userEvent.setup();
    const updateGoal = vi.fn<UpdateGoal>().mockResolvedValue({ ok: true });
    renderSettings(model({}), { updateGoal });
    const name = screen.getByRole("textbox", { name: "Display name for key_events" });
    await user.clear(name);
    await user.type(name, "Purchases");
    await user.tab();
    expect(updateGoal).toHaveBeenCalledWith({
      displayName: "Purchases",
      goalId: "goal_ga4",
      projectId: "prj_1",
    });
    const goal = document.querySelector('[data-conversion-goal="goal_ga4"]');
    if (!(goal instanceof HTMLElement)) throw new Error("missing goal");
    await user.click(within(goal).getByRole("switch", { name: "Enabled" }));
    expect(updateGoal).toHaveBeenCalledWith({
      enabled: false,
      goalId: "goal_ga4",
      projectId: "prj_1",
    });
  });
});

it("updates source status and keyed goal controls on new server props", () => {
  const original = model({});
  const { rerender, setPrimary, syncSource, updateGoal } = renderSettings(original);
  const next = model({
    plausibleConnected: false,
    goals: original.goals.map((goal) => ({ ...goal, enabled: !goal.enabled, countsRevenue: true })),
  });
  rerender(
    <ConversionsSettings
      actions={{ setPrimary, syncSource, updateGoal }}
      canEdit
      connectHref="/app/prj_1/settings/data-sources"
      model={next}
      projectId="prj_1"
    />,
  );
  expect(screen.queryByRole("table", { name: "Conversions by source" })).not.toBeInTheDocument();
  const row = document.querySelector<HTMLElement>('[data-conversion-goal="goal_signup"]');
  if (!row) throw new Error("missing goal");
  expect(within(row).getByRole("switch", { name: "Enabled" })).toBeChecked();
  expect(within(row).getByRole("switch", { name: "Counts revenue" })).toBeChecked();
});
