import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { stubBlobDownload } from "@/tests/blob-download";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

const mocks = vi.hoisted(() => ({
  exportKeywords: vi.fn(),
  fetch: vi.fn(),
  launchRankCheckRunAction: vi.fn(),
}));

vi.mock("@/lib/actions/keyword-export-action", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/lib/actions/rank-check-run-launch", () => ({
  launchRankCheckRunAction: mocks.launchRankCheckRunAction,
}));
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

const preview = {
  budget: {
    blocked: false,
    capCents: 5_000,
    mode: "legacy",
    reason: null,
    remainingAfterCents: 4_998,
    spentCents: 0,
  },
  estimate: { costCents: 2, perTargetCents: 2, unknownCostTargets: 0 },
  excluded: [],
  executable: 1,
  expiresAt: "2026-09-03T12:00:00.000Z",
  keywordCount: 1,
  matched: 1,
  previewToken: "preview-grid-token",
  selectionHash: "grid-selection",
  targetCount: 1,
} satisfies RankCheckRunPreview;

function previewResponse(value: RankCheckRunPreview = preview) {
  return new Response(JSON.stringify({ data: value }), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(previewResponse());
  mocks.launchRankCheckRunAction.mockResolvedValue({
    estimatedCostCents: 2,
    keywordCount: 1,
    publicId: "rcr_grid",
    status: "queued",
    targetCount: 1,
  });
  setNavigationState({ pathname: "/app/rank-tracker" });
  mocks.exportKeywords.mockResolvedValue({
    content: "keyword\n",
    count: 1,
    encoding: "utf8",
    filename: "keywords.csv",
    mimeType: "text/csv",
  });
  stubResizeObserver();
  stubBlobDownload();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KeywordsGrid actions", () => {
  it("deletes a pending keyword through normal bulk actions", async () => {
    const [row] = pendingRows(1);
    const actions = renderPendingGrid({ rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete keywords" }));

    await waitFor(() =>
      expect(actions.bulkDeleteAction).toHaveBeenCalledWith({
        keywordIds: [row.id],
        projectId: "prj_1",
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalled();
  }, 15_000);

  it("replaces bulk run checks with Connect when the SERP provider is missing", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({ rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));

    expect(screen.getByRole("link", { name: "Connect a SERP provider" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
    expect(screen.queryByRole("button", { name: /Run check/ })).not.toBeInTheDocument();
  });

  it("exports selected keyword IDs", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({ rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    fireEvent.click(
      within(screen.getByTestId("keywords-export-action")).getByRole("button", {
        name: /^export$/i,
      }),
    );

    expect(
      await screen.findByText("Export 1 selected keyword", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CPC")).not.toBeInTheDocument();
    expect(screen.queryByText("Search volume")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith({
        columns: {
          change: false,
          country: true,
          device: true,
          intent: true,
          tags: true,
          topic: true,
          url: true,
        },
        format: "csv",
        granularity: "daily",
        projectId: "prj_1",
        range: "30",
        scope: "current",
        selection: { keywordIds: [row.id], mode: "selected" },
      }),
    );
  }, 15_000);

  it("wiring: opens preflight from the bulk run-check trigger and launches with the preview token", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({
      checkHealth: {
        budget: { capCents: 5000, exhausted: false, spentCents: 1250 },
        failed24h: { count: 0, latest: null },
        providerRate: { overrideCents: 2, providerId: "dataforseo" },
      },
      providerConnected: true,
      rows,
    });

    await screen.findByText(rows[0].keyword);
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("0");
    expect(screen.queryByRole("button", { name: "Run check (Top 100)" })).not.toBeInTheDocument();

    const keywordRow = screen.getByText(rows[0].keyword).closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));

    expect(
      await screen.findByRole("dialog", {
        name: new RegExp(`Check ${rows[0].keyword} in United States`),
      }),
    ).toBeInTheDocument();
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      depth: 100,
      projectId: "prj_1",
      spec: { kind: "single", keywordId: rows[0].id, v: 1 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(mocks.launchRankCheckRunAction).toHaveBeenCalledWith(
      expect.objectContaining({ previewToken: "preview-grid-token" }),
    );
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("0");
  }, 20_000);

  it("passes a selected check depth override to the bulk preflight preview", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({ providerConnected: true, rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 20)" }));
    await screen.findByRole("dialog", {
      name: new RegExp(`Check ${row.keyword} in United States`),
    });
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ depth: 20 });
  }, 10_000);

  it("keeps preflight open when the verified launch refuses a sample project", async () => {
    const [row] = pendingRows(1);
    mocks.launchRankCheckRunAction.mockResolvedValue({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    });
    renderPendingGrid({ providerConnected: true, rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    await screen.findByRole("dialog", {
      name: new RegExp(`Check ${row.keyword} in United States`),
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sample projects don't run real checks.",
    );
    expect(
      screen.getByRole("dialog", { name: new RegExp(`Check ${row.keyword} in United States`) }),
    ).toBeInTheDocument();
  }, 10_000);

  it("opens the same preflight from Retry", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({
      checkHealth: {
        budget: { capCents: 5000, exhausted: false, spentCents: 1250 },
        failed24h: { count: 1, latest: null },
        providerRate: { overrideCents: 2, providerId: "dataforseo" },
      },
      providerConnected: true,
      rows,
    });

    await screen.findByText(rows[0].keyword);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("dialog", { name: /Check 2 selected keywords in United States/ }),
    ).toBeInTheDocument();
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      spec: { keywordIds: rows.map((row) => row.id), kind: "selected", v: 1 },
    });
  }, 15_000);

  it("exports locally filtered rows as an ID-scoped selection", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({ rows });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search keywords" }), {
      target: { value: rows[0].keyword },
    });
    await screen.findByRole("button", { name: /clear all search and filters/i });
    fireEvent.click(
      within(screen.getByTestId("keywords-export-action")).getByRole("button", {
        name: /^export$/i,
      }),
    );

    expect(await screen.findByText("Export 1 selected keyword")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith({
        columns: {
          change: false,
          country: true,
          device: true,
          intent: true,
          tags: true,
          topic: true,
          url: true,
        },
        format: "csv",
        granularity: "daily",
        projectId: "prj_1",
        range: "30",
        scope: "current",
        selection: { keywordIds: [rows[0].id], mode: "selected" },
      }),
    );
  }, 15_000);
});
