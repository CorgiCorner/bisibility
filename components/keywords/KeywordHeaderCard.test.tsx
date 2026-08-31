import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { ToastProvider } from "@/components/ui";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordHeaderCard } from "./KeywordHeaderCard";

const mocks = vi.hoisted(() => ({
  exportHistoryCsv: vi.fn(),
}));
type DimensionMockProps = {
  kind: "device" | "engine" | "location";
  label: string;
  onTrack: (kind: "device" | "engine" | "location", value: string) => void;
};
type HeaderActionsMockProps = {
  effectiveDepth: 10 | 20 | 50 | 100;
  onExport: () => void;
  onRunCheck: (depth: 10 | 20 | 50 | 100) => void;
  onToggleEdit: () => void;
  runPending: boolean;
};
vi.mock("@/components/ui", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui")>("@/components/ui");
  return {
    ...actual,
    Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    IdChip: ({ value }: { value: string }) => <span>{value}</span>,
  };
});
vi.mock("./keyword-history-export", () => ({
  exportHistoryCsv: mocks.exportHistoryCsv,
}));
vi.mock("./KeywordIndexStatus", () => ({
  KeywordIndexStatus: () => <p>Index status</p>,
}));
vi.mock("./KeywordMarketsDrawer", () => ({
  KeywordMarketsDrawer: ({ open }: { open: boolean }) => (
    <p data-open={open ? "true" : "false"}>Markets and devices drawer</p>
  ),
}));
vi.mock("@/components/keywords/add/AddKeywordDrawer", () => ({
  AddKeywordDrawer: ({
    defaultDevice,
    defaultLocation,
    onClose,
  }: {
    defaultDevice: string;
    defaultLocation: string;
    onClose: () => void;
  }) => (
    <div>
      <p>
        Drawer {defaultDevice} {defaultLocation}
      </p>
      <button onClick={onClose} type="button">
        Close drawer
      </button>
    </div>
  ),
}));
vi.mock("@/components/keywords/filters/DimensionSwitcher", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/keywords/filters/DimensionSwitcher")
  >("@/components/keywords/filters/DimensionSwitcher");
  return {
    ...actual,
    DimensionSwitcher: ({ kind, label, onTrack }: DimensionMockProps) => (
      <>
        <span data-testid={`dimension-${kind}`}>{label}</span>
        <button
          onClick={() => onTrack(kind, kind === "device" ? "Mobile" : "Poland")}
          type="button"
        >
          Track {kind}
        </button>
      </>
    ),
  };
});
vi.mock("./KeywordHeaderActions", () => ({
  KeywordHeaderActions: (props: HeaderActionsMockProps) => (
    <div>
      <button
        disabled={props.runPending}
        onClick={() => props.onRunCheck(props.effectiveDepth)}
        type="button"
      >
        Run check (Top {props.effectiveDepth})
      </button>
      <button disabled={props.runPending} onClick={() => props.onRunCheck(20)} type="button">
        Run check (Top 20)
      </button>
      <button onClick={props.onExport} type="button">
        Export
      </button>
      <button onClick={props.onToggleEdit} type="button">
        Edit
      </button>
    </div>
  ),
}));

const keyword = {
  device: "desktop",
  engine: "Google",
  id: "keyword_1",
  intent: "commercial",
  keyword: "rank tracker",
  location: {
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    languageLabel: "English",
  },
  locationName: "United States",
  rankingUrl: "https://example.com/rank-tracker",
  tags: ["core"],
  topic: "SEO",
  urlPresence: null,
};

function renderCard(overrides: Record<string, unknown> = {}) {
  const actions = {
    addKeywordsAction: vi.fn(),
    addKeywordsMatrixAction: vi.fn(),
    bulkDeleteAction: vi.fn(),
    createKeywordAlertAction: vi.fn(async () => ({})),
    runCheckNowAction: vi.fn(async () => ({ status: "running" })),
    updateKeywordAction: vi.fn(),
    updateKeywordScheduleAction: vi.fn(),
  };
  render(
    <SessionSpendProvider>
      <ToastProvider>
        <KeywordHeaderCard
          canCreateKeyword
          canUpdateKeyword
          keyword={keyword as never}
          projectId="prj_1"
          {...actions}
          {...overrides}
        />
      </ToastProvider>
    </SessionSpendProvider>,
  );
  return actions;
}

describe("KeywordHeaderCard", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("opens confirmation before starting, then enters the running flow", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      rankCheckId: "check_abcdefghijklmnopqrstuvwx",
      status: "running",
    });
    renderCard({
      costContext: { costPerCheckCents: 2, providerId: "dataforseo", timezone: "UTC" },
      projectMarkets: {
        markets: [],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 0,
        projectId: "prj_1",
      },
      runCheckNowAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));

    expect(runCheckNowAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Run rank check" })).toBeInTheDocument();
    expect(screen.getByText("Top 100")).toBeInTheDocument();
    expect(screen.getByText("~$0.02")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));

    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({
        depth: 100,
        keywordId: "keyword_1",
      }),
    );
    expect(await screen.findByRole("dialog", { name: "Check running" })).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("passes a selected depth override through confirmation", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      rankCheckId: "check_abcdefghijklmnopqrstuvwx",
      status: "running",
    });
    renderCard({ runCheckNowAction });

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 20)" }));
    expect(runCheckNowAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Run rank check" })).toBeInTheDocument();
    expect(screen.getByText("Top 20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));
    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({
        depth: 20,
        keywordId: "keyword_1",
      }),
    );
  });

  it("shows a retryable failed modal without a duplicate toast", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    });
    renderCard({ runCheckNowAction });

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));

    expect(await screen.findByRole("dialog", { name: "Check failed" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sample projects don't run real checks.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(runCheckNowAction).toHaveBeenCalledOnce();
    expect(screen.queryByText("Check started (Top 100)")).not.toBeInTheDocument();
  });

  it("renders target, ranking, timing, and provider metadata below the dimension chips", () => {
    renderCard({
      costContext: { providerId: "dataforseo" },
      keyword: {
        ...keyword,
        lastCheckAt: "2026-08-10T10:00:00.000Z",
        schedule: { next_check_at: "2026-08-11T06:00:00.000Z" },
        targetUrl: "https://example.com/rank-tracker",
      },
    });

    const metadata = screen.getByLabelText("Keyword check metadata");
    expect(metadata).toHaveTextContent("Target /rank-tracker");
    expect(metadata).toHaveTextContent("Ranking /rank-tracker");
    expect(metadata).toHaveTextContent("Matches target");
    expect(metadata).toHaveTextContent("Last check");
    expect(metadata).toHaveTextContent("Next check");
    expect(metadata).toHaveTextContent("DataForSEO");
  });

  it("keeps the live search link locale after removing the redundant engine chip", () => {
    renderCard();

    expect(screen.queryByTestId("dimension-engine")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View SERP" })).toHaveAttribute(
      "href",
      expect.stringContaining("gl=us&hl=en"),
    );
  });

  it("renders the keyword market controls without the old location/device add flow", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /United States \/ English/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track device" })).not.toBeInTheDocument();
  });

  it("works without a schedule editor", () => {
    renderCard({
      projectMarkets: {
        markets: [],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 0,
        projectId: "prj_1",
      },
      updateKeywordScheduleAction: undefined,
    });
    const drawer = screen.getByText("Markets and devices drawer");
    expect(drawer).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(drawer).toHaveAttribute("data-open", "true");
    expect(screen.queryByText(/Schedule/)).not.toBeInTheDocument();
  });
});
