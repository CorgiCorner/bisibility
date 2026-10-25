import type { SummaryDetails } from "@/lib/notifications/check-summaries/details-model";
export const summaryDetailsFixture: SummaryDetails = {
  kind: "scheduled",
  version: 3,
  withdrawn: false,
  windowStart: "2026-10-23T06:00:00Z",
  windowEnd: "2026-10-23T07:00:00Z",
  runPublicId: null,
  topN: 10,
  positionMove: 5,
  runsHref:
    "/app/prj_story/runs?view=checks&from=2026-10-23T06%3A00%3A00Z&to=2026-10-23T07%3A00%3A00Z&trigger=scheduled",
  incidentHrefs: ["/app/prj_story/runs?view=checks&incidentId=fixture"],
  rows: (["down", "up", "failed", "under_review", "unchanged", "new"] as const).map(
    (group, index) => ({
      checkId: `stored-${index}`,
      keywordPublicId: `kw_story${index}`,
      keyword: `Keyword ${index + 1}`,
      market: "Warsaw / pl / desktop",
      group,
      previous: group === "new" ? null : group === "up" ? 18 : 10,
      current:
        group === "down"
          ? 15
          : group === "up"
            ? 7
            : group === "unchanged"
              ? 10
              : group === "new"
                ? 12
                : null,
      available: true,
      deferredReason: null,
      projection:
        group === "failed"
          ? {
              acceptance: "accepted",
              fulfillment: "provider_error",
              returnedDepth: null,
              accounting: "unknown",
              recovery: null,
              result: "provider_error",
              cost: "unknown",
              originalCheckedAt: "2026-10-23T06:30:00Z",
            }
          : null,
    }),
  ),
};
