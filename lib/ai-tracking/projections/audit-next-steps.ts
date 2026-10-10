import type { TrackingSampleRow } from "./workspace";

export function trackingAuditNextSteps(samples: readonly TrackingSampleRow[], complete: boolean) {
  const uncertain = samples.filter(
    (sample) =>
      sample.costState === "unknown" ||
      sample.measurement === "unknown" ||
      sample.measurement === "unavailable",
  );
  const cited = samples.filter((sample) => sample.citations.length > 0);
  return [
    ...(!complete
      ? [
          {
            priority: 1,
            action: "Complete the bounded evidence review before drawing a run-wide conclusion.",
            evidenceIds: samples.map((sample) => sample.id),
            uncertainty: "Unloaded samples may change counts.",
          },
        ]
      : []),
    ...(uncertain.length
      ? [
          {
            priority: 1,
            action:
              "Reconcile unknown provider usage and inspect unavailable evidence before considering another paid attempt.",
            evidenceIds: uncertain.map((sample) => sample.id),
            uncertainty: "Unknown usage does not prove zero cost or provider failure.",
          },
        ]
      : []),
    ...(cited.length
      ? [
          {
            priority: 2,
            action:
              "Verify retained cited pages with the approved bounded, SSRF-safe browsing method.",
            evidenceIds: cited.map((sample) => sample.id),
            uncertainty: "Page contents were not fetched; a citation does not establish accuracy.",
          },
        ]
      : []),
  ];
}
export function trackingAuditExperiment(samples: readonly TrackingSampleRow[]) {
  return {
    status: "proposed_unexecuted",
    evidenceIds: samples.map((sample) => sample.id),
    proposal:
      "After resolving evidence gaps, consider an explicitly consented repeat observation of the same frozen configuration.",
    invariants: [
      "Exact prompt revision",
      "Source and engine",
      "Actual model",
      "Requested and effective locale",
      "Brand and competitor configuration",
    ],
    metricConditions: [
      "At least 90% complete coverage in both periods",
      "Show expected and eligible denominators",
      "Separate neutral, branded and comparative strata",
      "Exclude partial, failed and unknown answers from mention-rate eligibility",
      "Track absent AI Overviews separately",
    ],
    limitations: "No experiment has run and no causal improvement is predicted.",
  };
}
