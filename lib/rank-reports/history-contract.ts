import type { RankReportRequest } from "@/lib/rank-reports/model";
import type {
  RankReportAttempt,
  RankReportItem,
  RankReportObservation,
} from "@/lib/rank-reports/records";
import type { readRankReportFor } from "@/lib/rank-reports/service";

type Report = Awaited<ReturnType<typeof readRankReportFor>>;
export type HistoryWindow = RankReportRequest["window"];
type Envelope = Omit<Report, "records" | "stream">;
export type ObservationHistoryPage = Envelope & {
  records: readonly RankReportObservation[];
  stream: "observations";
};
export type AttemptHistoryPage = Envelope & {
  records: readonly RankReportAttempt[];
  stream: "attempts";
};
export type HistoryPage = ObservationHistoryPage | AttemptHistoryPage;
export type HistoryPages = { observations: ObservationHistoryPage; attempts: AttemptHistoryPage };
export type HistoryFailure = "forbidden" | "capacity" | "snapshot_conflict" | "unavailable";
export type HistoryRead<T> = { ok: true; value: T } | { ok: false; reason: HistoryFailure };

export type SavedFeatureFact = {
  checkId: string;
  feature: string;
  presence: "present" | "unknown" | "unsupported";
  sourceItemIds: readonly string[];
  ownership: "own" | "competitor" | "third_party" | "unknown";
  /** Supplied from this observation's retained identity proof, never today's edited identities. */
  identityRevision: string | null;
};
export type RetainedHistorySnapshot = {
  payment?: import("@/lib/action-payment/contract").ActionPaymentReceipt;
  asOf: string;
  projectId: string;
  observation: RankReportObservation;
  items: readonly RankReportItem[];
  detailState: "retained" | "expired" | "not_stored";
  /** Items and feature/ownership evidence must come from this same saved check. */
  featureFacts?: readonly SavedFeatureFact[];
};

/** Server adapters capture project, selected IDs, verified actor and transport; no client owner input. */
export type KeywordHistoryPort = {
  initial: HistoryPages;
  windows: readonly { id: string; window: HistoryWindow }[];
  readPage: (input: {
    cursor: string;
    stream: HistoryPage["stream"];
    window: HistoryWindow;
  }) => Promise<HistoryRead<HistoryPage>>;
  readWindow: (window: HistoryWindow) => Promise<HistoryRead<HistoryPages>>;
  readSnapshot: (input: {
    asOf: string;
    checkId: string;
  }) => Promise<HistoryRead<RetainedHistorySnapshot>>;
};
