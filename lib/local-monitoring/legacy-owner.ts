import { rankCheckWorkflowId } from "@/lib/rank-check/workflow-id";
import { contentKey, requireToken } from "./key";

/** Describes the existing keyword owner; it does not acquire a second lease or create a check. */
export function legacyKeywordOwner(projectId: string, keywordId: string) {
  requireToken(projectId, "project");
  requireToken(keywordId, "keyword");
  return Object.freeze({
    kind: "legacy_keyword" as const,
    projectId,
    keywordId,
    targetKey: contentKey("legacy-keyword-target-v1", [projectId, keywordId]),
    runningLeaseKeywordId: keywordId,
    workflowId: rankCheckWorkflowId(keywordId),
  });
}
