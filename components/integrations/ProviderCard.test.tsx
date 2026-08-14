import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProviderCard as ProductionProviderCard, type ProviderCardProps } from "./ProviderCard";

function ProviderCard({
  timeZone = "UTC",
  ...props
}: Omit<ProviderCardProps, "timeZone"> & { timeZone?: string }) {
  return <ProductionProviderCard {...props} timeZone={timeZone} />;
}

vi.mock("@/components/integrations/ConnectDrawer", () => ({
  ConnectDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="connect-drawer">Connect drawer</div> : null,
}));

describe("ProviderCard", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(screen.getByRole("button", { name: "Testing..." })).toBeDisabled();
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

    expect(screen.getByText("Never synced.")).toBeInTheDocument();
    expect(screen.getByText(/Traffic data appears after the first sync/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled();
    finish?.({
      connections: 1,
      keywordSnapshots: 12,
      pageSnapshots: 4,
      runs: [{ status: "succeeded_with_data" }],
    });

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Traffic sync finished. 12 keyword and 4 page snapshots updated.",
    );
    expect(actions.syncProjectTraffic).toHaveBeenCalledWith({ projectId: "prj_1" });
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

  it("guides misconfigured analytics properties back to Manage", () => {
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
      "The saved property looks misconfigured - open Manage and re-select it",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("2 consecutive failures · config invalid");
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

  it("disables analytics sync while the project is read-only", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      enabled: true,
      neverSynced: true,
      secondaryAction: "Test",
    };

    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });

  it("renders broken Google authorization as an actionable reconnect state", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reconnect to resume traffic and index-status syncs",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(screen.getByTestId("connect-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("does not claim GA4 resumes index-status syncs", () => {
    const ga4 = integrationCategories[1].providers.find(({ id }) => id === "ga4");
    if (!ga4) throw new Error("GA4 fixture is missing");
    const provider = {
      ...ga4,
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Reconnect to resume traffic syncs");
    expect(screen.getByRole("alert")).not.toHaveTextContent("index-status");
  });

  it("keeps provider status visible without manage controls below admin", () => {
    const provider = integrationCategories[0].providers[0];

    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("connect-drawer")).not.toBeInTheDocument();
  });
});
