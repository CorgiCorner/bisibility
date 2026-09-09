import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProviderCard as ProductionProviderCard, type ProviderCardProps } from "./ProviderCard";
import { consumerActionStyle } from "./ProviderConsumerRows";

function ProviderCard({
  timeZone = "UTC",
  ...props
}: Omit<ProviderCardProps, "timeZone"> & { timeZone?: string }) {
  return (
    <ProductionProviderCard {...props} searchSyncPlan={props.searchSyncPlan} timeZone={timeZone} />
  );
}

vi.mock("@/components/integrations/ConnectDrawer", () => ({
  ConnectDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="connect-drawer">Connect drawer</div> : null,
}));

describe("ProviderCard", () => {
  it("uses one muted accent interaction contract for consumer-row actions", () => {
    expect(consumerActionStyle).toEqual({
      "--control-color": "var(--fg-muted)",
      "--control-hover-border-color": "var(--accent)",
      "--control-hover-color": "var(--accent-text)",
      "--control-focus-border-color": "var(--accent)",
      "--control-focus-color": "var(--accent-text)",
    });
  });

  it("tests the stored connection without remounting the card result", async () => {
    let finish: ((value: { message: string; ok: boolean }) => void) | undefined;
    const actions = {
      connectProvider: vi.fn(async () => undefined),
      disconnectProvider: vi.fn(async () => undefined),
      testProviderConnection: vi.fn(
        () =>
          new Promise<{ message: string; ok: boolean }>((resolve) => {
            finish = resolve;
          }),
      ),
      updateProviderCost: vi.fn(async () => undefined),
      updateProviderSettings: vi.fn(async () => undefined),
    } satisfies ProviderActionHandlers;
    const provider = integrationCategories[0].providers[0];

    render(
      <ProviderCard
        actions={actions}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Test" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    expect(screen.getByRole("menuitem", { name: "Testing..." })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    finish?.({ message: "Stored credentials work.", ok: true });

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connection verified. Stored credentials work.",
    );
    expect(actions.testProviderConnection).toHaveBeenCalledWith({
      projectId: "prj_1",
      providerId: "dataforseo",
    });
  });

  it("shows independent Search Console and traffic states without a global last-sync claim", () => {
    const searchImportProgress = { qualifyingDays: 5, targetDays: 28 };
    const provider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: {
          detail: "corgitocoin.com",
          state: "backfill_running" as const,
          summary: `Running · ${searchImportProgress.qualifyingDays} of ${searchImportProgress.targetDays} finalized days`,
        },
        trafficEnrichment: { state: "never_synced" as const, summary: "Never synced" },
      },
      enabled: true,
      meta: [
        { label: "Property", value: "sc-domain:example.com" },
        { label: "Last sync", value: "Never" },
        { label: "State", value: "Enabled" },
      ],
      neverSynced: true,
      status: "connected" as const,
    };

    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectId="prj_1"
        projectRef="prj_1"
        provider={provider}
      />,
    );

    const searchRow = screen.getByRole("group", { name: "Search Console" });
    expect(searchRow).toHaveTextContent(
      `Running · ${searchImportProgress.qualifyingDays} of ${searchImportProgress.targetDays} finalized days`,
    );
    expect(within(searchRow).getByRole("heading", { name: "Search Console" })).toBeVisible();
    expect(within(searchRow).getByTitle("corgitocoin.com")).toHaveTextContent("corgitocoin.com");
    expect(searchRow).not.toHaveTextContent("sc-domain:");
    expect(within(searchRow).getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "href",
      "/app/prj_1/search-console",
    );
    expect(within(searchRow).getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(within(searchRow).getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "data-size",
      expect.stringMatching(/^(xs|sm)$/),
    );
    expect(within(searchRow).getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "data-size",
      "xs",
    );
    const trafficRow = screen.getByRole("group", { name: "Traffic enrichment" });
    expect(trafficRow).toHaveTextContent("Not synced yet");
    expect(
      within(trafficRow).getByRole("button", {
        name: "Adds clicks, impressions, and CTR to matching keywords in Rank Tracker.",
      }),
    ).toBeVisible();
    expect(trafficRow).not.toHaveTextContent("Traffic snapshots");
    expect(trafficRow).not.toHaveTextContent("this pipeline");
    expect(screen.queryByText("LAST SYNC")).not.toBeInTheDocument();
    expect(screen.queryByText("Never synced.")).not.toBeInTheDocument();
  });

  it("omits redundant not-configured consumer summaries", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: { state: "not_configured" as const, summary: "Not configured" },
        trafficEnrichment: { state: "not_configured" as const, summary: "Not configured" },
      },
      status: "connected" as const,
    };

    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectId="prj_1"
        projectRef="prj_1"
        provider={provider}
      />,
    );

    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
  });

  it("keeps connected metadata without repeating the state badge", () => {
    const base = integrationCategories[0].providers[0];
    const provider = { ...base, meta: [...base.meta, { label: "State", value: "Enabled" }] };
    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByText("Last rank check")).toBeVisible();
    expect(screen.getByText("12 min ago")).toBeVisible();
    expect(screen.getByText("Connected")).toBeVisible();
    expect(screen.queryByText("State")).not.toBeInTheDocument();
  });

  it("omits empty metadata and consumer panels before a provider is connected", () => {
    render(
      <ProviderCard
        canManageProviders
        canUpdateProject
        provider={{
          ...integrationCategories[1].providers[0],
          status: "ready",
          secondaryAction: undefined,
          meta: [
            { label: "Last sync", value: "Never" },
            { label: "State", value: "Ready" },
          ],
          consumerStatuses: {
            searchModule: { state: "not_configured", summary: "Not configured" },
            trafficEnrichment: { state: "not_configured", summary: "Not configured" },
          },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeVisible();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
    expect(screen.queryByText("State")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Traffic enrichment" })).not.toBeInTheDocument();
  });

  it("labels connected Search Console account management as connection settings", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      status: "connected" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connection settings" }));
    expect(screen.getByTestId("connect-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("disconnects from the provider card after confirmation", async () => {
    const actions = {
      connectProvider: vi.fn(async () => undefined),
      disconnectProvider: vi.fn(async () => undefined),
      testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
      updateProviderCost: vi.fn(async () => undefined),
      updateProviderSettings: vi.fn(async () => undefined),
    } satisfies ProviderActionHandlers;
    const provider = integrationCategories[0].providers[0];

    render(
      <ProviderCard
        actions={actions}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    const dialog = screen.getByRole("dialog", { name: "Disconnect provider" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect provider" }));

    await waitFor(() =>
      expect(actions.disconnectProvider).toHaveBeenCalledWith({
        projectId: "prj_1",
        providerId: "dataforseo",
      }),
    );
  });

  it("runs a connected analytics sync and explains the never-synced state", async () => {
    let finish:
      | ((value: {
          connections: number;
          keywordSnapshots: number;
          pageSnapshots: number;
          runs: { status: string }[];
        }) => void)
      | undefined;
    const actions = {
      connectProvider: vi.fn(async () => undefined),
      disconnectProvider: vi.fn(async () => undefined),
      syncProjectTraffic: vi.fn(
        () =>
          new Promise<{
            connections: number;
            keywordSnapshots: number;
            pageSnapshots: number;
            runs: { status: string }[];
          }>((resolve) => {
            finish = resolve;
          }),
      ),
      testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
      updateProviderCost: vi.fn(async () => undefined),
      updateProviderSettings: vi.fn(async () => undefined),
    } satisfies ProviderActionHandlers;
    const analyticsProvider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: { state: "first_view_ready" as const, summary: "First view ready" },
        trafficEnrichment: { state: "never_synced" as const, summary: "Never synced" },
      },
      enabled: true,
      neverSynced: true,
      secondaryAction: "Test",
    };

    render(
      <ProviderCard
        actions={actions}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={analyticsProvider}
      />,
    );

    const trafficRow = screen.getByRole("group", { name: "Traffic enrichment" });
    expect(trafficRow).toHaveTextContent("Not synced yet");
    fireEvent.click(screen.getByRole("button", { name: "Sync keyword traffic" }));

    expect(screen.getByRole("button", { name: "Syncing keyword traffic..." })).toBeDisabled();
    finish?.({
      connections: 1,
      keywordSnapshots: 12,
      pageSnapshots: 4,
      runs: [{ status: "succeeded_with_data" }],
    });

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Keyword traffic sync finished. 12 keyword and 4 page snapshots updated.",
    );
    expect(actions.syncProjectTraffic).toHaveBeenCalledWith({ projectId: "prj_1" });
  });

  it("runs only traffic sync from the Traffic enrichment row", async () => {
    const actions = {
      connectProvider: vi.fn(async () => undefined),
      disconnectProvider: vi.fn(async () => undefined),
      syncProjectTraffic: vi.fn(async () => ({
        connections: 1,
        keywordSnapshots: 1,
        pageSnapshots: 2,
        runs: [{ status: "succeeded_with_data" }],
      })),
      testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
      updateProviderCost: vi.fn(async () => undefined),
      updateProviderSettings: vi.fn(async () => undefined),
    } satisfies ProviderActionHandlers;
    const provider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: { state: "paused_by_user" as const, summary: "Paused by you" },
        trafficEnrichment: { state: "ready" as const, summary: "Ready" },
      },
      enabled: true,
    };

    render(
      <ProviderCard
        actions={actions}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
      />,
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Traffic enrichment" })).getByRole("button", {
        name: "Sync keyword traffic",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Adds clicks, impressions, and CTR to matching keywords in Rank Tracker.",
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(actions.syncProjectTraffic).toHaveBeenCalledWith({ projectId: "prj_1" }),
    );
    expect(actions.testProviderConnection).not.toHaveBeenCalled();
  });

  it("shows consumer state to viewers without mutation controls", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: { state: "paused_by_user" as const, summary: "Paused by you" },
        trafficEnrichment: { state: "never_synced" as const, summary: "Never synced" },
      },
      enabled: true,
    };
    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectRef="prj_1"
        provider={provider}
      />,
    );
    expect(screen.getByText("Paused by you")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync keyword traffic" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "href",
      "/app/prj_1/search-console",
    );
  });

  it("renders sync failures in the project timezone", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      enabled: true,
      neverSynced: undefined,
      status: "connected" as const,
      syncFailure: {
        consecutiveFailures: 1,
        errorClass: "unknown",
        since: "2026-07-18T13:40:00.000Z",
      },
    };

    render(
      <ProviderCard
        actions={{} as ProviderActionHandlers}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
        timeZone="Europe/Madrid"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Traffic sync is failing. Failing since Jul 18, 2026, 15:40 (Europe/Madrid) · 1 consecutive failure · unclassified (recorded before error-class upgrade).",
    );
    expect(alert).not.toHaveTextContent("18 Jul 2026");
    expect(alert.querySelector("time")).toHaveTextContent("Jul 18, 2026, 15:40 (Europe/Madrid)");
    expect(alert.querySelector("time")).toHaveAttribute("dateTime", "2026-07-18T13:40:00.000Z");
    expect(screen.queryByText("Never synced.")).not.toBeInTheDocument();
    expect(screen.queryByText(/authorization is no longer valid/)).not.toBeInTheDocument();
  });

  it("guides misconfigured Search Console properties to Connection settings", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      enabled: true,
      status: "connected" as const,
      syncFailure: {
        consecutiveFailures: 2,
        errorClass: "config_invalid",
        since: "2026-07-18T13:40:00.000Z",
      },
    };

    render(
      <ProviderCard
        actions={{} as ProviderActionHandlers}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The saved property looks misconfigured - open Connection settings and re-select it.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("2 consecutive failures · config invalid");
  });

  it("retains Manage remediation for other connected providers", () => {
    const provider = {
      ...integrationCategories[0].providers[0],
      syncFailure: {
        consecutiveFailures: 2,
        errorClass: "config_invalid",
        since: "2026-07-18T13:40:00.000Z",
      },
    };

    render(
      <ProviderCard
        actions={{} as ProviderActionHandlers}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The saved property looks misconfigured - open Manage and re-select it.",
    );
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
  });

  it("renders unreadable stored credentials without changing the connected state", () => {
    const provider = {
      ...integrationCategories[0].providers[0],
      credentialIssue: "unreadable" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stored credentials can't be read. Reconnect the provider.",
    );
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
  });

  it("keeps connection maintenance disabled while the project is read-only", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProviderCard
          canManageProviders
          canUpdateProject
          provider={integrationCategories[0].providers[0]}
        />
      </ProjectWriteModeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    expect(screen.getByRole("menuitem", { name: "Test" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Disconnect" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables analytics sync while the project is read-only", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      consumerStatuses: {
        searchModule: { state: "first_view_ready" as const, summary: "First view ready" },
        trafficEnrichment: { state: "ready" as const, summary: "Ready" },
      },
      enabled: true,
      neverSynced: true,
      secondaryAction: "Test",
    };

    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByRole("button", { name: "Sync keyword traffic" })).toBeDisabled();
  });
  it.each([
    [
      new Error("Credentials could not be revoked."),
      "Provider action failedCredentials could not be revoked.",
      false,
    ],
    [
      new Error('Server Action "missing" was not found on the server.'),
      "App update required",
      true,
    ],
  ])(
    "keeps disconnect confirmation open and shows rejected action details",
    async (error, expected, stale) => {
      const actions = {
        connectProvider: vi.fn(async () => undefined),
        disconnectProvider: vi.fn().mockRejectedValue(error),
        testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
        updateProviderCost: vi.fn(async () => undefined),
        updateProviderSettings: vi.fn(async () => undefined),
      } satisfies ProviderActionHandlers;
      render(
        <ProviderCard
          actions={actions}
          canManageProviders
          canUpdateProject
          projectId="prj_1"
          provider={integrationCategories[0].providers[0]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Disconnect" }));
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Disconnect provider" })).getByRole("button", {
          name: "Disconnect provider",
        }),
      );
      const dialog = screen.getByRole("dialog", { name: "Disconnect provider" });
      await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(expected));
      expect(dialog).toBeInTheDocument();
      expect(
        within(dialog).queryByText("The action could not be completed. Try again."),
      ).toBeNull();
      expect(screen.queryByText("Connection verified.")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      if (stale)
        expect(within(dialog).getByRole("button", { name: "Refresh app" })).toBeInTheDocument();
    },
  );
});
