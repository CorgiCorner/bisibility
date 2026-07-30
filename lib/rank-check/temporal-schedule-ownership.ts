import { RECONCILER_SCHEDULE_ID } from "@/lib/temporal/bootstrap";
import type { ScheduleDescription, ScheduleSummary } from "@temporalio/client";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "./dispatcher-constants";
import { rankCheckScheduleId } from "./temporal-schedule";
import { RANK_CHECK_WORKFLOW_TYPE } from "./workflow-id";

type OwnedClassification = {
  classification: "owned";
  keywordId: string;
  projectId: string;
  reason: "exact-owned-rank-check-schedule";
};

type OtherClassification = {
  classification: "ambiguous" | "dispatcher-singleton" | "singleton" | "unrelated";
  reason: string;
};

export type RankCheckScheduleClassification = OwnedClassification | OtherClassification;

function stringField(value: unknown, field: string) {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function searchAttributes(attributes: unknown) {
  const values = new Map<string, unknown>();
  if (!attributes) return null;
  let pairs: unknown;
  try {
    if (Array.isArray(attributes)) {
      pairs = attributes;
    } else if (typeof attributes === "object") {
      const getAll = (attributes as { getAll?: unknown }).getAll;
      pairs = typeof getAll === "function" ? getAll.call(attributes) : null;
    } else {
      pairs = null;
    }
  } catch {
    return null;
  }
  if (!Array.isArray(pairs)) return null;
  for (const pair of pairs) {
    if (!pair || typeof pair !== "object") return null;
    const keyValue = (pair as { key?: unknown }).key;
    const key =
      keyValue && typeof keyValue === "object" ? (keyValue as { name?: unknown }).name : undefined;
    if (typeof key !== "string" || !("value" in pair)) return null;
    if (values.has(key)) return null;
    values.set(key, (pair as { value: unknown }).value);
  }
  return values;
}

function exactSearchIdentifiers(
  attributes: unknown,
  keywordId: string,
  projectId: string,
  level: "action" | "schedule",
) {
  const values = searchAttributes(attributes);
  if (!values) return `${level}-search-attributes-undecodable`;
  const searchKeywordId = values.get("keywordId");
  const searchProjectId = values.get("projectId");
  if (typeof searchKeywordId !== "string" || typeof searchProjectId !== "string") {
    return `${level}-search-identifiers-missing`;
  }
  if (searchKeywordId !== keywordId) return `${level}-search-keyword-mismatch`;
  if (searchProjectId !== projectId) return `${level}-search-project-mismatch`;
  return null;
}

export function classifyRankCheckSchedule(
  description: ScheduleDescription,
): RankCheckScheduleClassification {
  const scheduleId = description.scheduleId;
  if (scheduleId === RECONCILER_SCHEDULE_ID) {
    return { classification: "singleton", reason: "rank-check-reconciler-singleton" };
  }
  if (scheduleId === RANK_CHECK_DISPATCHER_SCHEDULE_ID) {
    return {
      classification: "dispatcher-singleton",
      reason: "rank-check-dispatcher-singleton",
    };
  }
  if (!scheduleId.startsWith("rank-check-")) {
    return { classification: "unrelated", reason: "outside-rank-check-namespace" };
  }

  const keywordId = stringField(description.memo, "keywordId");
  const projectId = stringField(description.memo, "projectId");
  if (stringField(description.memo, "kind") !== "rank-check") {
    return { classification: "ambiguous", reason: "memo-kind-mismatch" };
  }
  if (!keywordId || !projectId) {
    return { classification: "ambiguous", reason: "memo-identifiers-missing" };
  }
  if (scheduleId !== rankCheckScheduleId(keywordId)) {
    return { classification: "ambiguous", reason: "schedule-id-mismatch" };
  }
  if (description.action.workflowType !== RANK_CHECK_WORKFLOW_TYPE) {
    return { classification: "ambiguous", reason: "workflow-type-mismatch" };
  }
  if (description.action.workflowId !== scheduleId) {
    return { classification: "ambiguous", reason: "workflow-id-mismatch" };
  }
  const input = description.action.args?.[0];
  if (stringField(input, "keywordId") !== keywordId) {
    return { classification: "ambiguous", reason: "action-keyword-mismatch" };
  }

  const scheduleSearchReason = exactSearchIdentifiers(
    description.typedSearchAttributes,
    keywordId,
    projectId,
    "schedule",
  );
  if (scheduleSearchReason) {
    return { classification: "ambiguous", reason: scheduleSearchReason };
  }
  const actionSearchReason = exactSearchIdentifiers(
    description.action.typedSearchAttributes,
    keywordId,
    projectId,
    "action",
  );
  if (actionSearchReason) {
    return { classification: "ambiguous", reason: actionSearchReason };
  }
  return {
    classification: "owned",
    keywordId,
    projectId,
    reason: "exact-owned-rank-check-schedule",
  };
}

export function listSummaryContradiction(
  summary: ScheduleSummary,
  description: ScheduleDescription,
) {
  const classification = classifyRankCheckSchedule(description);
  if (classification.classification !== "owned") return null;
  const keywordId = classification.keywordId;
  const projectId = classification.projectId;
  if (summary.scheduleId !== description.scheduleId) return "list-schedule-id-mismatch";
  if (summary.action?.workflowType !== description.action.workflowType) {
    return "list-workflow-type-mismatch";
  }
  if (
    stringField(summary.memo, "kind") !== "rank-check" ||
    stringField(summary.memo, "keywordId") !== keywordId ||
    stringField(summary.memo, "projectId") !== projectId
  ) {
    return "list-memo-mismatch";
  }
  return exactSearchIdentifiers(summary.typedSearchAttributes, keywordId, projectId, "schedule");
}
