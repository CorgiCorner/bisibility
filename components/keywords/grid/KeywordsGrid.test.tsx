import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { appPath } from "@/lib/routing/app-path";
import type { RunCheckNowInput } from "@/lib/schemas/keyword";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsGrid } from "./KeywordsGrid";

const mocks = vi.hoisted(() => ({ exportKeywords: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

// The page-level meter is gone (the header owns the only spend tracker), so tests
// observe session spend through the provider instead of rendered meter copy.
function SessionSpendProbe() {
  const { sessionCents } = useSessionSpend();
  return <output aria-label="session spend cents">{sessionCents}</output>;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/keywords",
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/actions/keyword-import-export", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/components/keywords/import/ImportCsvWizard", () => ({
  ImportCsvWizard: () => null,
}));
vi.mock("./DeferredDataGrid", async () => {
  const { MuiDataGrid } = await import("./MuiDataGrid");
  return {
    DeferredDataGrid: (props: Omit<ComponentProps<typeof MuiDataGrid>, "onReady">) => (
      <MuiDataGrid {...props} onReady={() => undefined} />
    ),
  };
});

type KeywordsGridProps = ComponentProps<typeof KeywordsGrid>;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exportKeywords.mockResolvedValue({
    content: "keyword\n",
    count: 1,
    encoding: "utf8",
    filename: "keywords.csv",
    mimeType: "text/csv",
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }),
  );
});

function pendingRows(count = 2): KeywordsGridProps["rows"] {
  return keywordRows.slice(0, count).map((row) => ({
    ...row,
    checkState: "never_checked",
    hasRankData: false,
    lastCheckAt: null,
    lastCheckStatus: null,
    position: 101,
    positionHistory: [],
    previousPosition: 101,
    rankingPath: null,
    rankingUrl: null,
    rankingUrlHistory: [],
    sparkline: [],
  }));
}

function renderPendingGrid(overrides: Partial<KeywordsGridProps> = {}) {
  const actions = {
    addKeywordsAction: vi.fn().mockResolvedValue({ created: 1, keywords: [] }),
    bulkClearTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkDeleteAction: vi.fn().mockResolvedValue({ deleted: 1 }),
    bulkSetFrequencyAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkSetTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkTagAction: vi.fn().mockResolvedValue({ updated: 1 }),
    canCreateKeyword: true,
    canDeleteKeyword: true,
    canManageProviders: true,
    canUpdateKeyword: true,
    deletableSavedViewIds: [],
    getFirstCheckRunPlanAction: vi.fn().mockResolvedValue({
      budget: { capCents: 5000, spentCents: 0 },
      budgetExhausted: false,
      estimatedCostPerCheckCents: 0.1,
      isSampleProject: false,
      providerReady: true,
      providers: ["dataforseo"],
      readyCount: 2,
      scope: {
        depth: "Top 100",
        device: "Desktop",
        engine: "Google",
        frequency: "Daily",
        location: "United States",
      },
    }),
    queueFirstChecksAction: vi.fn().mockResolvedValue({ queued: 1 }),
    updateKeywordAction: vi.fn().mockResolvedValue({ updated: 1 }),
  };

  render(
    <SessionSpendProvider>
      <SessionSpendProbe />
      <KeywordImportProvider activeProjectId="project_1">
        <KeywordsGrid
          {...actions}
          projectId="prj_1"
          providerConnected={false}
          rows={pendingRows()}
          savedViews={[]}
          tagSuggestions={[]}
          {...overrides}
        />
      </KeywordImportProvider>
    </SessionSpendProvider>,
  );

  return actions;
}

describe("KeywordsGrid pending state", () => {
  it("keeps the keyword table and pagination within the workspace viewport", () => {
    renderPendingGrid({ providerConnected: true, rows: [keywordRows[0]] });

    expect(screen.getByTestId("keywords-grid-viewport")).toHaveClass(
      "h-[650px]",
      "min-h-[420px]",
      "max-h-[calc(100dvh-200px)]",
    );
  });

  it("picks Search Console suggestions then opens the add drawer with them joined", async () => {
    const importTopQueriesAction = vi.fn(async () => ({
      hidden: [],
      hiddenCount: 0,
      queries: ["open source rank tracker", "rank tracking for agencies"],
      suggestions: [{ query: "open source rank tracker" }, { query: "rank tracking for agencies" }],
    }));
    renderPendingGrid({ importTopQueriesAction, rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Find Search Console queries" }));

    await waitFor(() =>
      expect(importTopQueriesAction).toHaveBeenCalledWith({ limit: 50, projectId: "prj_1" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Add 2 keywords/i }));

    expect(await screen.findByRole("textbox", { name: "Keywords" })).toHaveValue(
      "open source rank tracker\nrank tracking for agencies",
    );
  });

  it("labels the first completed observation as new", async () => {
    renderPendingGrid({
      providerConnected: true,
      rows: [{ ...keywordRows[0], positionBaseline: null, previousPosition: null }],
    });

    expect(await screen.findByText("New")).toHaveAttribute("aria-label", "First observation");
  });

  it("renders pending keywords in the normal management grid", async () => {
    renderPendingGrid();

    expect(screen.getByText("No rankings yet.")).toBeInTheDocument();
    expect(screen.getByText("2 keywords are ready for the first rank check.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect provider/i })).toHaveAttribute(
      "href",
      appPath("prj_1", "integrations"),
    );
    expect(screen.getByRole("radio", { name: /all device scope/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all keywords/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /columns/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add keyword/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /device/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /frequency/i })).toBeInTheDocument();
    expect(await screen.findByText(keywordRows[0].keyword)).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Awaiting first check", {}, { timeout: 10000 })).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("labels a completed check with no result as not found in top 100", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({
      rows: [{ ...row, hasRankData: true, lastCheckStatus: "completed", position: 101 }],
    });

    expect(await screen.findByText("Not found in top 100")).toBeInTheDocument();
  });

  it("keeps filter clearing in the toolbar when visible rows are empty", async () => {
    renderPendingGrid({
      initialViewConfig: {
        filters: { ...emptyKeywordFilters, contains: "missing keyword" },
        lens: { device: "desktop", locationId: null },
        search: "",
        surface: "keywords",
        version: 1,
      },
      lens: { device: "desktop", locationId: null },
    });

    expect(
      await screen.findByText("No keywords match Desktop with 1 active filter"),
    ).toBeInTheDocument();
    expect(screen.getByText("Active filters")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /clear all/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /show all locations & devices/i }));

    expect(mocks.push).toHaveBeenCalledWith(`${appPath("prj_1", "keywords")}?device=all`);
    fireEvent.click(screen.getByRole("button", { name: /clear all search and filters/i }));
    expect(await screen.findByText(keywordRows[0].keyword)).toBeInTheDocument();
  });

  it("deletes a pending keyword through normal bulk actions", async () => {
    const [row] = pendingRows(1);
    const actions = renderPendingGrid({ rows: [row] });

    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete keywords" }));

    await waitFor(() =>
      expect(actions.bulkDeleteAction).toHaveBeenCalledWith({
        keywordIds: [row.id],
        projectId: "prj_1",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("exports selected keyword IDs", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({ rows: [row] });

    fireEvent.click((await screen.findAllByRole("checkbox"))[1]);
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    expect(screen.getByText("Export 1 selected keyword")).toBeInTheDocument();
    expect(screen.queryByText("CPC")).not.toBeInTheDocument();
    expect(screen.queryByText("Search volume")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith(
        expect.objectContaining({ keywordIds: [row.id], projectId: "prj_1" }),
      ),
    );
  });

  it("shows Run checks only with a selection and runs it for the selected keywords", async () => {
    const rows = pendingRows(2);
    let resolveCheck!: (value: unknown) => void;
    const runCheckNowAction = vi.fn(
      (_input: RunCheckNowInput) =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    renderPendingGrid({
      checkHealth: {
        budget: { capCents: 5000, exhausted: false, spentCents: 1250 },
        failed24h: { count: 0, latest: null },
        providerRate: { overrideCents: 2, providerId: "dataforseo" },
      },
      rows,
      runCheckNowAction,
    });

    await screen.findByText(rows[0].keyword);
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("0");
    expect(screen.queryByRole("button", { name: "Run check (Top 100)" })).not.toBeInTheDocument();

    fireEvent.click((await screen.findAllByRole("checkbox"))[1]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));

    await waitFor(() => expect(runCheckNowAction).toHaveBeenCalledTimes(1));
    expect([rows[0].id, rows[1].id]).toContain(runCheckNowAction.mock.calls[0][0].keywordId);
    expect(runCheckNowAction.mock.calls[0][0]).not.toHaveProperty("depth");
    expect(screen.getByText(rows[0].keyword)).toBeInTheDocument();
    expect(screen.getByText(rows[1].keyword)).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();

    resolveCheck({ status: "queued" });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("2");
  });

  it("passes a selected check depth override", async () => {
    const [row] = pendingRows(1);
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "queued" });
    renderPendingGrid({ rows: [row], runCheckNowAction });

    fireEvent.click((await screen.findAllByRole("checkbox"))[1]);
    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({ depth: 20, keywordId: row.id }),
    );
  });

  it("exports filtered keyword IDs when no rows are selected", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({ rows });

    fireEvent.change(screen.getByRole("textbox", { name: "Filter keywords" }), {
      target: { value: rows[0].keyword },
    });
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    expect(screen.getByText("Export 1 filtered keyword")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith(
        expect.objectContaining({ keywordIds: [rows[0].id], projectId: "prj_1" }),
      ),
    );
  });
});
