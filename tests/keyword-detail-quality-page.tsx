import { historyPages } from "@/components/keyword-detail-history/history.test-fixture";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { projectKeywordDetailQuality } from "@/lib/keyword-detail/quality-projector";
import { detailTarget } from "@/lib/keyword-detail/quality-test-fixture";
import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import type {
  HistoryPages,
  HistoryWindow,
  KeywordHistoryPort,
} from "@/lib/rank-reports/history-contract";
import { reportKeyword, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import type { ReactNode } from "react";
import { vi } from "vitest";

const detailPageMocks = vi.hoisted(() => ({
  metadata: vi.fn(),
  paired: vi.fn(),
  header: vi.fn(),
  pending: vi.fn(),
  history: vi.fn(),
  legacyUrls: vi.fn(),
  rawIndex: vi.fn(),
  rawLoad: vi.fn(),
  page: vi.fn(),
  window: vi.fn(),
  snapshot: vi.fn(),
  paid: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: async () => ({}) }));
vi.mock("@/i18n/translator.server", () => ({ createIntlTranslator: () => (key: string) => key }));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordDetail: detailPageMocks.metadata,
  getKeywordTagSuggestions: async () => [],
}));
vi.mock("@/lib/queries/keyword-detail-history", () => ({
  loadKeywordDetailHistoryWindow: detailPageMocks.paired,
  loadKeywordHistoryPage: detailPageMocks.page,
  refreshKeywordHistoryWindow: detailPageMocks.window,
  loadKeywordHistorySnapshot: detailPageMocks.snapshot,
}));
vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: async () => ({ publicId: reportProject.publicId }),
  requireReadableProject: async () => ({
    actor: { id: "session-viewer", memberships: [{ projectId: reportProject.id, role: "viewer" }] },
    project: { ...reportProject, domain: "example.test" },
  }),
}));
vi.mock("@/components/keywords/rank-tracker-cost-context", () => ({
  loadRankTrackerCostContext: async () => null,
}));
vi.mock("@/lib/queries/keyword-target-context", () => ({
  getKeywordTargetContext: async () => ({ projectMarkets: undefined, targets: [] }),
}));
vi.mock("@/lib/queries/competitor-policies", () => ({ getKeywordCompetitors: async () => [] }));
vi.mock("@/lib/queries/retrieved-results", () => ({
  storedResultsIndex: detailPageMocks.rawIndex,
  loadRetrievedResultsForChecks: detailPageMocks.rawLoad,
}));
vi.mock("@/lib/actions/alerts", () => ({ createKeywordAlertRule: detailPageMocks.paid }));
vi.mock("@/lib/actions/extend-snapshot", () => ({ extendSerpSnapshot: detailPageMocks.paid }));
vi.mock("@/lib/actions/keyword", () => ({ updateKeyword: detailPageMocks.paid }));
vi.mock("@/lib/actions/rankCheck", () => ({ runCheckNow: detailPageMocks.paid }));
vi.mock("@/lib/actions/retrieved-results", () => ({
  loadRetrievedResults: detailPageMocks.rawLoad,
}));
vi.mock("@/lib/actions/traffic-sync", () => ({ syncProjectTraffic: detailPageMocks.paid }));
vi.mock("@/components/keywords/add/KeywordManagementMessagesBoundary", () => ({
  KeywordManagementMessagesBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/ui/BackLink", () => ({
  BackLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/keywords/KeywordHeaderCard", () => ({
  KeywordHeaderCard: (props: unknown) => {
    detailPageMocks.header(props);
    return <section>Header</section>;
  },
}));
vi.mock("@/components/keywords/KeywordPendingDetail", () => ({
  KeywordPendingDetail: (props: { history?: ReactNode }) => {
    detailPageMocks.pending(props);
    return <section>Pending{props.history}</section>;
  },
}));
vi.mock("@/components/keyword-detail-history/KeywordDetailHistory", () => ({
  KeywordDetailHistory: (props: unknown) => {
    detailPageMocks.history(props);
    return <section>History</section>;
  },
}));
vi.mock("@/components/keywords/RankingUrlHistory", () => ({
  RankingUrlHistory: detailPageMocks.legacyUrls,
}));
vi.mock("@/components/keywords/KeywordTrafficCard", () => ({
  KeywordTrafficCard: () => <section>Traffic</section>,
}));
vi.mock("@/components/keywords/RetrievedResultsCard", () => ({
  RetrievedResultsCard: () => <section>Retained diagnostics</section>,
}));

/** Real kernel/projection; verified session and list/detail DAL are explicit unit ports, not auth/DB proof. */
export function configureDetailPage(target = detailTarget()) {
  vi.clearAllMocks();
  const metadata = {
    ...rankTrackerQualityFixture().row,
    position: 99,
    bestPosition: 99,
    providerConnected: false,
    traffic: {
      hasAnalyticsConnection: false,
      hasSearchConsoleConnection: false,
      pages: [],
      query: null,
    },
  };
  detailPageMocks.metadata.mockResolvedValue(metadata);
  detailPageMocks.rawIndex.mockResolvedValue([]);
  detailPageMocks.rawLoad.mockResolvedValue([]);
  let captured: { quality: KeywordDetailQuality; history: HistoryPages } | null = null;
  detailPageMocks.paired.mockImplementation(async (_scope: unknown, window: HistoryWindow) => {
    const projection = projectKeywordDetailQuality(
      metadata,
      [target],
      reportPolicy(),
      reportProject.id,
      "installed-paired-source",
    );
    const pages = historyPages();
    const envelope = {
      asOf: projection.quality.asOf,
      sourceDigest: projection.quality.sourceDigest,
    };
    const history: HistoryPages = {
      observations: { ...pages.observations, ...envelope, window },
      attempts: { ...pages.attempts, ...envelope, window: { ...window, basis: "recorded_at" } },
    };
    captured = { quality: projection.quality, history };
    return { history, quality: projection.quality, keyword: { ...metadata, ...projection.row } };
  });
  return {
    metadata,
    captured: () => {
      if (!captured) throw new Error("Installed paired loader was not invoked");
      return captured;
    },
  };
}
export const detailPageParams = () =>
  Promise.resolve({ id: reportKeyword, project: reportProject.publicId });
export type CapturedDetailHeader = {
  keyword: { position: number; bestPosition: number | null };
  quality: KeywordDetailQuality;
  rankState?: string;
};
export type CapturedDetailHistory = { history: KeywordHistoryPort };

export function getDetailPageMocks() {
  return detailPageMocks;
}
