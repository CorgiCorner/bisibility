import {
  type ConformanceDocument,
  type ConformanceKind,
  captureFindingsChecker,
  type Finding,
  operationsById,
  type ResponseCapture,
} from "./openapi-response-findings.test-support";

/**
 * Turns captured router responses into the response conformance failure list: one entry per
 * failing operation and status, plus one per operation without a captured response (`none`)
 * or without a captured success (`2xx`).
 */

export type ConformanceEntry = {
  details?: string[];
  kinds: ConformanceKind[];
  operation: string;
  sources?: string[];
  status: string;
};

export type SourcedCapture = { capture: ResponseCapture; source: string };

type FindingGroup = { found: Finding[]; operation: string; sources: Set<string>; status: string };

const maxDetails = 25;
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function failureEntries(groups: Iterable<FindingGroup>): ConformanceEntry[] {
  return [...groups].map(({ found, operation, sources, status }) => {
    const kinds = [...new Set(found.map((finding) => finding.kind))].sort(compareText);
    const details = [...new Set(found.map((finding) => `${finding.kind} ${finding.detail}`))].sort(
      compareText,
    );
    const shown = details.slice(0, maxDetails);
    if (details.length > maxDetails) shown.push(`... ${details.length - maxDetails} more`);
    return { details: shown, kinds, operation, sources: [...sources].sort(compareText), status };
  });
}

function coverageEntries(operationIds: Iterable<string>, captures: readonly ResponseCapture[]) {
  const statuses = new Map<string, number[]>();
  for (const capture of captures) {
    statuses.set(capture.operationId, [
      ...(statuses.get(capture.operationId) ?? []),
      capture.status,
    ]);
  }
  const entries: ConformanceEntry[] = [];
  for (const operationId of operationIds) {
    const captured = statuses.get(operationId) ?? [];
    if (captured.length === 0) {
      entries.push({ kinds: ["no-capture"], operation: operationId, status: "none" });
    } else if (!captured.some((status) => status >= 200 && status < 300)) {
      entries.push({ kinds: ["no-success-capture"], operation: operationId, status: "2xx" });
    }
  }
  return entries;
}

export function evaluateResponseConformance(
  document: ConformanceDocument,
  sourced: readonly SourcedCapture[],
): ConformanceEntry[] {
  const findingsOf = captureFindingsChecker(document);
  const groups = new Map<string, FindingGroup>();
  for (const { capture, source } of sourced) {
    const found = findingsOf(capture);
    if (found.length === 0) continue;
    const key = `${capture.operationId} ${capture.status}`;
    const group = groups.get(key) ?? {
      found: [],
      operation: capture.operationId,
      sources: new Set<string>(),
      status: String(capture.status),
    };
    group.found.push(...found);
    group.sources.add(source);
    groups.set(key, group);
  }
  const captures = sourced.map(({ capture }) => capture);
  return [
    ...failureEntries(groups.values()),
    ...coverageEntries(operationsById(document).keys(), captures),
  ].sort(
    (left, right) =>
      compareText(left.operation, right.operation) || compareText(left.status, right.status),
  );
}
