import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordHeaderCard } from "./KeywordHeaderCard";

const mocks = vi.hoisted(() => ({
  exportHistoryCsv: vi.fn(),
  refresh: vi.fn(),
}));
type DimensionMockProps = {
  kind: "device" | "engine" | "location";
  label: string;
  onTrack: (kind: "device" | "engine" | "location", value: string) => void;
};
type HeaderActionsMockProps = {
  alertCreated: boolean;
  alertCreating: boolean;
  effectiveDepth: 10 | 20 | 50 | 100;
  onCreateAlert: () => void;
  onExport: () => void;
  onRunCheck: (depth: 10 | 20 | 50 | 100) => void;
  onToggleEdit: () => void;
};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
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
vi.mock("./KeywordEditDrawer", () => ({
  KeywordEditDrawer: ({
    open,
    updateKeywordScheduleAction,
  }: {
    open: boolean;
    updateKeywordScheduleAction?: unknown;
  }) =>
    open ? (
      <p>
        Edit drawer · {updateKeywordScheduleAction ? "Schedule enabled" : "Schedule unavailable"}
      </p>
    ) : null,
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
      <button onClick={() => props.onRunCheck(props.effectiveDepth)} type="button">
        Run
      </button>
      <button onClick={props.onCreateAlert} type="button">
        Alert
      </button>
      <button onClick={props.onExport} type="button">
        Export
      </button>
      <button onClick={props.onToggleEdit} type="button">
        Edit
      </button>
      <p>
        {props.alertCreated
          ? "alert-created"
          : props.alertCreating
            ? "alert-creating"
            : "alert-idle"}
      </p>
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
    createKeywordAlertAction: vi.fn(async () => ({})),
    runCheckNowAction: vi.fn(async () => ({ status: "running" })),
    updateKeywordAction: vi.fn(),
    updateKeywordScheduleAction: vi.fn(),
  };
  render(
    <ToastProvider>
      <KeywordHeaderCard
        canCreateKeyword
        canUpdateKeyword
        keyword={keyword as never}
        projectId="project_1"
        {...actions}
        {...overrides}
      />
    </ToastProvider>,
  );
  return actions;
}

describe("KeywordHeaderCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts a check, creates an alert, exports, and opens editing", async () => {
    const actions = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Check started (Top 100)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alert" }));
    expect(await screen.findByText("alert-created")).toBeInTheDocument();
    expect(screen.getByText("Alert created")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(mocks.exportHistoryCsv).toHaveBeenCalledWith(keyword);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/Edit drawer · Schedule enabled/)).toBeInTheDocument();
    expect(actions.runCheckNowAction).toHaveBeenCalledWith({
      depth: 100,
      keywordId: "keyword_1",
    });
  });

  it("uses the keyword schedule depth for the default manual check", async () => {
    const actions = renderCard({
      keyword: {
        ...keyword,
        projectSerpDepth: 50,
        schedule: { serp_depth: 20 },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(actions.runCheckNowAction).toHaveBeenCalledWith({ depth: 20, keywordId: "keyword_1" }),
    );
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
    expect(metadata).toHaveTextContent("Ranking /rank-tracker Matches target");
    expect(metadata).toHaveTextContent("Last check");
    expect(metadata).toHaveTextContent("Next check");
    expect(metadata).toHaveTextContent("DataForSEO");
  });

  it("keeps the engine chip label to the engine while the external link retains its locale", () => {
    renderCard();

    expect(screen.getByTestId("dimension-engine")).toHaveTextContent("Google");
    expect(screen.getByTestId("dimension-engine")).not.toHaveTextContent("/");
  });

  it("opens tracking drawers with device and location prefills", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Track device" }));
    expect(screen.getByText("Drawer mobile United States")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    fireEvent.click(screen.getByRole("button", { name: "Track location" }));
    expect(screen.getByText("Drawer desktop Poland")).toBeInTheDocument();
  });

  it("reports check and alert failures and prevents duplicate alert requests", async () => {
    const check = vi.fn(async () => {
      throw new Error("Check unavailable");
    });
    const alert = vi.fn(async () => {
      throw new Error("Alert unavailable");
    });
    renderCard({ createKeywordAlertAction: alert, runCheckNowAction: check });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Check unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alert" }));
    expect(await screen.findByText("Alert unavailable")).toBeInTheDocument();
    await waitFor(() => expect(alert).toHaveBeenCalledOnce());
  });

  it("treats a serialized budget rejection as a failed check", async () => {
    renderCard({
      runCheckNowAction: vi.fn().mockResolvedValue({
        code: "budget_exhausted",
        message: "Rank check monthly budget reached.",
        status: "not_started",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("Rank check monthly budget reached.")).toBeInTheDocument();
    expect(screen.queryByText("Check started (Top 100)")).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("works without an alert action or schedule editor", () => {
    renderCard({
      createKeywordAlertAction: undefined,
      updateKeywordScheduleAction: undefined,
    });
    fireEvent.click(screen.getByRole("button", { name: "Alert" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/Edit drawer · Schedule unavailable/)).toBeInTheDocument();
  });
});
