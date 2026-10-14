import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { organicDomainRanksFromRaw } from "@/lib/rank-check/organic-ranks";
import { rawTextHash, replayDigest } from "./hash";
import {
  REPLAY_LIMITS,
  type ReplayEvaluation,
  type ReplayExclusion,
  type ReplaySource,
} from "./model";
import { retainedOrganicReplay } from "./retained";
/** Does not infer completeness, provider time, scope or revisions from legacy rank facts. */
export function evaluateOrganicReplay(source: ReplaySource, projectId: string): ReplayEvaluation {
  const exclude = (status: ReplayExclusion): ReplayEvaluation => ({
    status,
    facts: null,
    sourceKind: "unavailable",
    retainedObservedAt: null,
    outputHash: null,
    qualification: "retained_facts_only",
  });
  if (source.status !== "completed") return exclude("not_completed");
  if (
    !isPublicIdOfType(source.checkPublicId, "check") ||
    !isPublicIdOfType(source.keywordPublicId, "kw")
  )
    return exclude("invalid_source_id");
  if (source.storedText !== null) return exclude("projection_present");
  if (!["dataforseo", "serpapi"].includes(source.provider)) return exclude("unsupported_provider");
  if (source.rawBytes > REPLAY_LIMITS.sourceBytes) return exclude("source_too_large");
  if (
    source.rawHash !== rawTextHash(source.rawText) ||
    source.storedHash !== rawTextHash(source.storedText)
  )
    throw new Error("evidence_replay_invalid_source_hash");
  if (source.rawText === null || source.rawText === "null") {
    if (!source.observation) return exclude("raw_expired");
    const retained = retainedOrganicReplay(source, projectId);
    if (retained && retained.facts.length > 100) return exclude("source_too_large");
    return retained
      ? {
          status: "applied",
          facts: retained.facts,
          outputHash: replayDigest(retained.facts),
          sourceKind: "retained_observation",
          retainedObservedAt: retained.observedAt,
          qualification: "retained_facts_only",
        }
      : exclude("retained_owner_unavailable");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(source.rawText);
  } catch {
    return exclude("unrecognized_container");
  }
  // Old multi-task containers are not an unambiguous original collection.
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "tasks" in raw &&
    !("organic_results" in raw || "organicResults" in raw)
  ) {
    const tasks = raw.tasks;
    if (
      !Array.isArray(tasks) ||
      tasks.length !== 1 ||
      !tasks[0] ||
      !Array.isArray(tasks[0].result) ||
      tasks[0].result.length !== 1
    )
      return exclude("unrecognized_container");
  }
  const root =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    ("organic_results" in raw || "organicResults" in raw)
      ? {
          ...("organic_results" in raw ? { organic_results: raw.organic_results } : {}),
          ...("organicResults" in raw ? { organicResults: raw.organicResults } : {}),
        }
      : raw;
  const facts = organicDomainRanksFromRaw(root);
  if (facts && facts.length > 100) return exclude("source_too_large");
  return facts === null
    ? exclude("unrecognized_container")
    : {
        status: "applied",
        facts,
        outputHash: replayDigest(facts),
        sourceKind: "legacy_root_raw",
        retainedObservedAt: (() => {
          const retained = retainedOrganicReplay(source, projectId);
          return retained && replayDigest(retained.facts) === replayDigest(facts)
            ? retained.observedAt
            : null;
        })(),
        qualification: "retained_facts_only",
      };
}
