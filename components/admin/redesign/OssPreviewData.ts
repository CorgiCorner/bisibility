export type OssScreen = {
  question: string;
  metrics: readonly { label: string; value: string; detail?: string }[];
  details: readonly { label: string; value: string }[];
};
export type OssPreviewData = Record<string, OssScreen>;
export const ossPreviewFixture: OssPreviewData = Object.fromEntries(
  Object.entries({
    Status: "Is the instance healthy?",
    Worker: "Are workers and schedules healthy?",
    Checks: "Are rank checks and URL presence healthy?",
    "Data sources": "Are data sources healthy?",
    Tasks: "Which tasks need recovery?",
    Notifications: "Are operational notifications delivered?",
    Accounts: "Which account needs attention?",
    "Sending today": "How much email can this instance send today?",
    Settings: "How is instance email configured?",
    Audit: "What changed on this instance?",
  }).map(([view, question]) => [view, { question, metrics: [], details: [] }]),
);
