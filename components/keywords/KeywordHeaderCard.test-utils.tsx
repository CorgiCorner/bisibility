import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { ToastProvider } from "@/components/ui/Toast";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { KeywordHeaderCard } from "./KeywordHeaderCard";

const mocked = vi.hoisted(() => ({
  exportHistoryCsv: vi.fn(),
  fetch: vi.fn(),
  launchRankCheckRunAction: vi.fn(),
}));

export { mocked as mocks };

type HeaderActionsMockProps = {
  effectiveDepth: 10 | 20 | 50 | 100;
  onExport: () => void;
  onRunCheck: (depth: 10 | 20 | 50 | 100) => void;
  onToggleEdit: () => void;
  runPending: boolean;
};

vi.mock("@/components/ui/Card", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/Card")>()),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/IdChip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/IdChip")>()),
  IdChip: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("./keyword-history-export", () => ({ exportHistoryCsv: mocked.exportHistoryCsv }));
vi.mock("@/lib/actions/rank-check-run-launch", () => ({
  launchRankCheckRunAction: mocked.launchRankCheckRunAction,
}));
vi.mock("./KeywordEditDrawer", () => ({
  KeywordEditDrawer: ({
    open,
    updateKeywordAction,
  }: {
    open: boolean;
    updateKeywordAction: unknown;
  }) => (
    <p
      data-open={open ? "true" : "false"}
      data-can-save={typeof updateKeywordAction === "function"}
    >
      Keyword editor
    </p>
  ),
}));
vi.mock("./KeywordMarketsDrawer", () => ({
  KeywordMarketsDrawer: ({ open }: { open: boolean }) => (
    <p data-open={open ? "true" : "false"}>Markets and devices drawer</p>
  ),
}));
vi.mock("./KeywordHeaderActions", () => ({
  KeywordHeaderActions: (props: HeaderActionsMockProps) => (
    <div>
      <output>Selected depth {props.effectiveDepth}</output>
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

export const keyword = {
  checkSchedule: {
    name: "Daily 06:00",
    nextCheckAt: "2026-08-11T06:00:00.000Z",
    publicId: "sch_daily",
  },
  device: "desktop",
  engine: "Google",
  id: "keyword_1",
  intent: "commercial",
  keyword: "rank tracker",
  location: {
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    languageLabel: "English",
  },
  locationName: "United States",
  rankingUrl: "https://example.com/rank-tracker",
  schedule: {
    cron_expression: null,
    frequency: "daily",
    jitter_minutes: 0,
    last_checked_at: null,
    next_check_at: "2026-08-11T06:00:00.000Z",
    timezone: "UTC",
  },
  targetUrl: null,
  tags: ["core"],
  topic: "SEO",
  urlPresence: null,
};

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
  previewToken: "preview-header-token",
  selectionHash: "header-selection",
  targetCount: 1,
} satisfies RankCheckRunPreview;

function previewResponse(value: RankCheckRunPreview = preview) {
  return new Response(JSON.stringify({ data: value }), { status: 200 });
}

export function resetHeaderCardMocks() {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocked.fetch);
  mocked.fetch.mockResolvedValue(previewResponse());
  mocked.launchRankCheckRunAction.mockResolvedValue({
    estimatedCostCents: 2,
    keywordCount: 1,
    publicId: "rcr_header",
    status: "queued",
    targetCount: 1,
  });
}

export function renderCard(overrides: Record<string, unknown> = {}) {
  const actions = {
    addKeywordsAction: vi.fn(),
    addKeywordsMatrixAction: vi.fn(),
    bulkDeleteAction: vi.fn(),
    createKeywordAlertAction: vi.fn(async () => ({})),
    runCheckNowAction: vi.fn(async () => ({ status: "running" })),
    updateKeywordAction: vi.fn(),
  };
  render(
    <SessionSpendProvider>
      <ToastProvider>
        <KeywordHeaderCard
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
