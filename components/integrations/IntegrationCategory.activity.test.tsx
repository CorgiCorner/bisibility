import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import type {
  IntegrationProviderData,
  ProviderActionHandlers,
  ProviderTrafficSyncResult,
} from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationCategory } from "./IntegrationCategory";
import { integrationCategories } from "./integrations-fixtures";

vi.mock("@/components/integrations/ConnectDrawer", () => ({ ConnectDrawer: () => null }));

const provider = {
  ...integrationCategories[1].providers[0],
  enabled: true,
  consumerStatuses: {
    searchModule: {
      detail: "example.com",
      state: "backfill_running",
      summary:
        "Status unavailable · 33 of 64 finalized days are imported · Current runtime facts are unavailable.",
    },
    trafficEnrichment: { state: "never_synced", summary: "Never synced" },
  },
  meta: [{ label: "Last sync", value: "Never" }],
} satisfies IntegrationProviderData;

function renderCategory({
  selected = provider,
  canUpdateProject = true,
  readOnly = false,
  actions,
}: {
  selected?: IntegrationProviderData;
  canUpdateProject?: boolean;
  readOnly?: boolean;
  actions?: ProviderActionHandlers;
} = {}) {
  return render(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode={readOnly ? "migration_hold" : "active"}>
      <IntegrationCategory
        actions={actions}
        canManageProviders={false}
        canUpdateProject={canUpdateProject}
        category={{
          ...integrationCategories[1],
          providers: [selected, integrationCategories[1].providers[2]],
        }}
        projectId="prj_1"
        projectRef="prj_1"
        timeZone="UTC"
      />
    </ProjectWriteModeProvider>,
  );
}

describe("IntegrationCategory activity", () => {
  it("keeps full status and sync controls after the connection cards, without duplicates", () => {
    renderCategory();
    const activity = screen.getByRole("region", { name: "Google Search Console activity" });
    expect(activity).toHaveTextContent(provider.consumerStatuses.searchModule.summary);
    expect(screen.getAllByRole("group", { name: "Search Console" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sync keyword traffic" })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Plausible" }).compareDocumentPosition(activity),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Last sync")).not.toBeInTheDocument();
    expect(screen.getByText("Property").closest("dl")).toHaveTextContent("example.com");
    expect(within(activity).getByRole("link", { name: "Open Search Console" })).toHaveAttribute(
      "href",
      "/app/prj_1/search-console",
    );
  });

  it("retains pending state and completion feedback when syncing from the separate panel", async () => {
    let finish: ((result: ProviderTrafficSyncResult) => void) | undefined;
    const syncProjectTraffic = vi.fn(
      () =>
        new Promise<ProviderTrafficSyncResult>((resolve) => {
          finish = resolve;
        }),
    );
    const actions = {
      connectProvider: vi.fn(),
      disconnectProvider: vi.fn(),
      testProviderConnection: vi.fn(),
      updateProviderCost: vi.fn(),
      updateProviderSettings: vi.fn(),
      syncProjectTraffic,
    } satisfies ProviderActionHandlers;
    renderCategory({ actions });
    fireEvent.click(screen.getByRole("button", { name: "Sync keyword traffic" }));
    expect(screen.getByRole("button", { name: "Syncing keyword traffic..." })).toBeDisabled();
    expect(syncProjectTraffic).toHaveBeenCalledWith({ projectId: "prj_1" });
    finish?.({
      connections: 1,
      keywordSnapshots: 12,
      pageSnapshots: 4,
      runs: [{ status: "succeeded_with_data" }],
    });
    const activity = screen.getByRole("region", { name: "Google Search Console activity" });
    await waitFor(() =>
      expect(within(activity).getByRole("status")).toHaveTextContent(
        "Keyword traffic sync finished. 12 keyword and 4 page snapshots updated.",
      ),
    );
  });

  it.each([
    { canUpdateProject: false },
    { selected: { ...provider, enabled: false } },
    { selected: { ...provider, status: "needs_reauth" as const } },
  ])("keeps activity readable without unauthorized sync controls (%j)", (options) => {
    renderCategory(options);
    expect(screen.getByRole("region", { name: "Google Search Console activity" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sync keyword traffic" })).not.toBeInTheDocument();
  });

  it("disables sync in a read-only project", () => {
    renderCategory({ readOnly: true });
    expect(screen.getByRole("button", { name: "Sync keyword traffic" })).toBeDisabled();
  });

  it.each([
    { ...provider, status: "ready" as const },
    { ...provider, consumerStatuses: undefined },
  ])("omits activity before a connection has consumer status (%j)", (selected) => {
    renderCategory({ selected });
    expect(
      screen.queryByRole("region", { name: "Google Search Console activity" }),
    ).not.toBeInTheDocument();
  });
});
