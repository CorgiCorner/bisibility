import { createHash } from "node:crypto";
import type { ReportJson } from "@/lib/agent-reports/model";
import { createAgentReport } from "@/lib/agent-reports/service";
import type { AiResearchContext } from "./outcome-types";
import { boundAiRow } from "./row-budget";
import type { AiResearchResult } from "./types";

/** Share retained dataset evidence across an account, never across credential payers. */
export function researchFundingIdentity(connection: {
  credentialSource?: string;
  credentialsEncrypted?: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify([connection.credentialSource, connection.credentialsEncrypted]))
    .digest("hex");
}
export function researchReportResult(result: AiResearchResult) {
  // 100 rows must fit the shared 256 KiB report bound. The cache retains fuller evidence.
  return {
    ...result,
    rows: result.rows.map((row) =>
      boundAiRow(
        { ...row, model: row.model.slice(0, 32), observedAt: row.observedAt?.slice(0, 32) ?? null },
        2_400,
        true,
      ),
    ),
  };
}
export async function copyResearchReport(
  context: AiResearchContext,
  cached: {
    result: AiResearchResult;
    researchReport?: {
      projectId: string;
      keyword: string;
      identity: Record<string, unknown>;
      provenance: Record<string, ReportJson>;
    };
  },
) {
  const retained = cached.researchReport;
  if (!retained || retained.projectId === context.projectId) return null;
  return createAgentReport({
    projectId: context.projectId,
    actorId: context.actorId,
    kind: "prompt_research",
    title: `Prompt Research: ${retained.keyword}`,
    body: {
      input: retained.identity as Record<string, ReportJson>,
      result: researchReportResult(cached.result),
    },
    provenance: retained.provenance,
  });
}
