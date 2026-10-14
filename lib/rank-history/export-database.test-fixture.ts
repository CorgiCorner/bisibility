import type { Mock } from "vitest";

type LegacyMocks = {
  $transaction: Mock;
  $queryRaw: Mock;
  keyword: { findMany: Mock };
  rankCheck: { count: Mock; findMany: Mock };
};
/** Unit-only DB model. It adds no observation metadata and never supplies positive quality proof. */
export function configureHistoryExportDatabase(db: LegacyMocks) {
  db.$transaction.mockImplementation((read: (tx: LegacyMocks) => Promise<unknown>) => read(db));
  db.$queryRaw.mockImplementation((parts: TemplateStringsArray, actorId: string) =>
    Promise.resolve(
      actorId !== "user_1"
        ? []
        : parts.join("").includes("memberships")
          ? [{ role: "viewer" }]
          : [{ id: actorId }],
    ),
  );
  const rows = async () => {
    const returned = db.keyword.findMany.mock.results.at(-1);
    const keywords = returned?.type === "return" ? await returned.value : [];
    return keywords.flatMap(
      (keyword: {
        id?: string;
        publicId: string;
        rankChecks?: readonly Record<string, unknown>[];
      }) =>
        (keyword.rankChecks ?? []).map((check) => ({
          ...check,
          keywordId: keyword.id ?? keyword.publicId,
          attemptCount: 1,
          createdAt: check.checkedAt,
          updatedAt: check.checkedAt,
          finishedAt: check.checkedAt,
          startedAt: null,
          status: "completed",
          observationRun: null,
          deferredReason: null,
          errorCode: null,
          expectedUrlAtCheck: null,
        })),
    );
  };
  db.rankCheck.count.mockImplementation(async () => (await rows()).length);
  db.rankCheck.findMany.mockImplementation(rows);
}

export async function historyExportTestHostModule() {
  const { reportPolicy } = await import("@/lib/rank-reports/report-test-fixture");
  return {
    historyExportReportOptions: (_context: unknown, asOf = new Date()) => ({
      asOf,
      limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
      policyAt: (at: Date) => ({ ...reportPolicy(), asOf: at }),
      loadMetadata: async () => new Map(),
    }),
  };
}
export async function historyExportTestCursorModule() {
  const { createReportCursorCodec } = await import("@/lib/rank-reports/cursor");
  return {
    hostRankReportCursorCodec: () =>
      createReportCursorCodec("synthetic-route-cursor-key-for-tests"),
  };
}
