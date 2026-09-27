import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { routerMock } from "@/tests/next-navigation";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRunPreflight } from "./useRunPreflight";

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("@/lib/actions/rank-check-run-launch", () => ({ launchRankCheckRunAction: mocks.launch }));

const preview: RankCheckRunPreview = {
  budget: {
    blocked: false,
    capCents: null,
    mode: "legacy",
    reason: null,
    remainingAfterCents: null,
    spentCents: 0,
  },
  estimate: { costCents: 100, perTargetCents: 1, unknownCostTargets: 0 },
  excluded: [],
  executable: 2400,
  expiresAt: "2026-09-27T10:00:00.000Z",
  keywordCount: 1200,
  matched: 2400,
  overlapRunCount: 0,
  overlaps: [],
  previewToken: "initial",
  selectionHash: "initial",
  targetCount: 2400,
};

function Harness() {
  const preflight = useRunPreflight({
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    providerId: "serpapi",
  });
  return (
    <>
      <button
        type="button"
        onClick={() => preflight.requestMarket({ canonicalKey: "US:en", label: "US market" }, 20)}
      >
        Run market
      </button>
      {preflight.dialog}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("whole-market manual preflight", () => {
  it("uses server counts beyond a page or selected-ID limit, refreshes depth, and launches the same market", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: preview }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ...preview, keywordCount: 1199, targetCount: 2398, previewToken: "top50" },
        }),
      });
    vi.stubGlobal("fetch", fetch);
    mocks.launch.mockResolvedValue({
      estimatedCostCents: 100,
      keywordCount: 1199,
      publicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "queued",
      targetCount: 2398,
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Run market" }));
    expect(
      screen.getByRole("heading", { name: /Check all keywords in US market/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Run scope")).toHaveTextContent("1,200 keywords · 2,400 checks");
    const initial = JSON.parse(fetch.mock.calls[0]?.[1].body);
    expect(initial).toMatchObject({
      depth: 20,
      trigger: "manual",
      spec: {
        kind: "filter",
        query: { lens: { locationId: "US:en", device: "all" }, search: "", page: 1 },
      },
    });
    expect(initial.spec.query.filters).toMatchObject({ position: [], tags: [], contains: "" });
    expect(mocks.launch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Top 50" }));
    expect(screen.getByLabelText("Run scope")).toHaveTextContent("1,199 keywords · 2,398 checks");
    const updated = JSON.parse(fetch.mock.calls[1]?.[1].body);
    expect(updated).toEqual({ ...initial, depth: 50 });
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start run" }));
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 50, previewToken: "top50", spec: initial.spec }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
