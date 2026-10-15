import { AgentReportDetail } from "@/components/agent-reports/AgentReportDetail";
import { trackingEvidenceAudit } from "@/lib/ai-tracking/projections/audit-report";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import { trackingSampleFixtures } from "./fixtures";

const input = trackingEvidenceAudit({
  runId: "air_oct08",
  samples: trackingSampleFixtures,
  expected: 3,
  hasMore: false,
});
export function TrackingAuditReportFixture() {
  return (
    <AgentReportDetail
      projectRef="prj_abcdefghijklmnopqrstuvwx"
      provenanceLabel="Provenance"
      savedDetailsLabel={auditMessages.projectSiteAudit.savedDetails}
      report={{
        id: "agr_abcdefghijklmnopqrstuvwx",
        kind: input.kind,
        title: input.title,
        body: input.body,
        provenance: input.provenance ?? {},
        createdAt: "2026-10-08T10:00:00.000Z",
      }}
    />
  );
}
