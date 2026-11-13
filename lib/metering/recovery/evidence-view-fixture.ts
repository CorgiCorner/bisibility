import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import type { RecoveryPage } from "./contract";
import { recoveryViewFixture } from "./view-fixture";

export function evidenceRecoveryFixture(
  result: EvidenceProjection["result"] = "under_review",
  cost: EvidenceProjection["cost"] = "under_review",
): RecoveryPage {
  const page = recoveryViewFixture();
  return {
    ...page,
    rows: [
      {
        ...page.rows[0],
        token: "evidence-fixture",
        reference: "ref-evidence-fixture",
        historical: false,
        action: null,
        evidence: {
          projection: {
            acceptance: "unconfirmed",
            fulfillment:
              result === "partial" ? "partial" : result === "recovered" ? "complete" : "pending",
            returnedDepth: result === "partial" ? 20 : null,
            accounting: cost === "conflict" ? "conflict" : "unknown",
            result,
            cost,
            originalCheckedAt: "2026-10-23T06:00:00Z",
            recovery: {
              state: "operator_review",
              lastAttemptAt: "2026-10-24T06:00:00Z",
              nextAttemptAt: "2026-10-24T07:00:00Z",
              reason: "history_not_ready",
            },
          },
          incident: {
            href: "/app/prj_example_history/runs?view=checks&incidentId=example",
            openedAt: "2026-10-24T06:00:00.000Z",
            ageMinutes: 60,
          },
        },
      },
    ],
    partialEvidence: [
      {
        id: "partial-fixture",
        kind: "partial",
        project: "prj_example_history",
        checkHref: "/app/prj_example_history/runs?view=checks",
        returnedDepth: 20,
        createdAt: "2026-10-24T06:00:00Z",
      },
      {
        id: "unresolved-fixture",
        kind: "unresolved",
        project: "prj_example_history",
        checkHref: "/app/prj_example_history/runs?view=checks",
        returnedDepth: null,
        createdAt: "2026-10-24T06:00:00Z",
      },
    ],
  };
}
