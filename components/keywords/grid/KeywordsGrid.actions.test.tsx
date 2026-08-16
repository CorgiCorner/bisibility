import type { RunCheckNowInput } from "@/lib/schemas/keyword";
import { stubBlobDownload } from "@/tests/blob-download";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

const mocks = vi.hoisted(() => ({ exportKeywords: vi.fn() }));

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

beforeEach(() => {
  vi.clearAllMocks();
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
  });

  it("exports selected keyword IDs", async () => {
    const [row] = pendingRows(1);
    renderPendingGrid({ rows: [row] });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    expect(
      await screen.findByText("Export 1 selected keyword", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CPC")).not.toBeInTheDocument();
    expect(screen.queryByText("Search volume")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith(
        expect.objectContaining({ keywordIds: [row.id], projectId: "prj_1" }),
      ),
    );
  }, 15_000);

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

    const keywordRow = screen.getByText(rows[0].keyword).closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));

    expect(runCheckNowAction).toHaveBeenCalledTimes(1);
    expect([rows[0].id, rows[1].id]).toContain(runCheckNowAction.mock.calls[0][0].keywordId);
    expect(runCheckNowAction.mock.calls[0][0]).not.toHaveProperty("depth");
    expect(screen.getByText(rows[0].keyword)).toBeInTheDocument();
    expect(screen.getByText(rows[1].keyword)).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();

    resolveCheck({ status: "queued" });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("session spend cents")).toHaveTextContent("2");
  }, 10_000);

  it("passes a selected check depth override", async () => {
    const [row] = pendingRows(1);
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "queued" });
    renderPendingGrid({ rows: [row], runCheckNowAction });

    const keywordRow = (await screen.findByText(row.keyword)).closest(
      '[role="row"]',
    ) as HTMLElement;
    fireEvent.click(within(keywordRow).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({ depth: 20, keywordId: row.id }),
    );
  });

  it("exports filtered keyword IDs when no rows are selected", async () => {
    const rows = pendingRows(2);
    renderPendingGrid({ rows });

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter keywords" }), {
      target: { value: rows[0].keyword },
    });
    await screen.findByRole("button", { name: /clear all search and filters/i });
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    expect(await screen.findByText("Export 1 filtered keyword")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(mocks.exportKeywords).toHaveBeenCalledWith(
        expect.objectContaining({ keywordIds: [rows[0].id], projectId: "prj_1" }),
      ),
    );
  }, 15_000);
});
