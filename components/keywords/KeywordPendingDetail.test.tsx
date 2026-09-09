import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordPendingDetail } from "./KeywordPendingDetail";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("./KeywordMarketsDrawer", () => ({
  KeywordMarketsDrawer: () => null,
}));
vi.mock("./KeywordHeaderActions", () => ({
  KeywordHeaderActions: ({
    effectiveDepth,
    onToggleEdit,
  }: {
    effectiveDepth: number;
    onToggleEdit: () => void;
  }) => (
    <div>
      <button type="button">Run check</button>
      <button type="button" onClick={onToggleEdit}>
        Edit
      </button>
      <output>Selected depth {effectiveDepth}</output>
    </div>
  ),
}));

function pendingKeyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return {
    ...keywordRows[0],
    checkSchedule: null,
    checkState: "never_checked",
    hasRankData: false,
    position: 101,
    positionHistory: [],
    rankingUrl: null,
    rankingUrlHistory: [],
    targetUrl: "/self-host",
    trackedDepth: 20,
    ...overrides,
  };
}

function renderDetail(
  keyword = pendingKeyword(),
  rankState: "never_checked" | "not_ranked" = "never_checked",
) {
  render(
    <ToastProvider>
      <KeywordPendingDetail
        canUpdateKeyword
        keyword={keyword}
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState={rankState}
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
      />
    </ToastProvider>,
  );
}

describe("KeywordPendingDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("keeps pending content below the shared header without duplicate details", () => {
    renderDetail();

    expect(screen.getByLabelText("Keyword check metadata")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Position history" })).toBeInTheDocument();
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Keyword context")).not.toBeInTheDocument();
  });

  it("shows Manual and opens SetScheduleModal from set schedule", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              cronExpression: null,
              enabled: true,
              frequency: "daily",
              isDefault: true,
              jitterMinutes: 15,
              keywordCount: 1,
              name: "Daily 06:00",
              publicId: "sch_daily",
              serpDepth: null,
              timeOfDay: "06:00",
              timezone: "UTC",
            },
          ],
        }),
      ),
    );
    renderDetail();

    const header = screen.getByLabelText("Keyword check metadata");
    expect(header).toHaveTextContent("Not scheduled");
    expect(header).toHaveTextContent("Manual");
    fireEvent.click(screen.getByRole("button", { name: "set schedule" }));

    expect(await screen.findByRole("dialog", { name: /Set schedule/ })).toBeInTheDocument();
    expect(screen.getByText("Set schedule for 1 keyword / 1 target")).toBeInTheDocument();
  });

  it("uses the project default depth for both the pending position and Run check", () => {
    renderDetail(
      pendingKeyword({
        projectSerpDepth: 50,
        schedule: { ...keywordRows[0].schedule, serp_depth: 100 },
        trackedDepth: 20,
      }),
      "not_ranked",
    );

    expect(screen.getByText("Not ranked")).toBeInTheDocument();
    expect(screen.getByText(/Not in top 50/)).toBeInTheDocument();
    expect(screen.getByText("Selected depth 50")).toBeInTheDocument();
  });
  it("opens keyword details including the target URL without requiring market management actions", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Target URL")).toHaveDisplayValue("/self-host");
    expect(screen.getByRole("heading", { name: /Edit keyword/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save markets and devices" }),
    ).not.toBeInTheDocument();
  });
});
