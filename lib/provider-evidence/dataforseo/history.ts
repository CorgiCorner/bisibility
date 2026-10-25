import "server-only";

import { type HistoryScope, historyCapability } from "./capabilities";
import {
  array,
  type LookupFailure,
  lookupFailure,
  nullableCostCents,
  record,
  status,
} from "./outcomes";
import { parseRecoveryGet } from "./parser";
import { metadataWindow, providerDatetime, resultRetention } from "./retention";
import type { HistoryTransport } from "./transport";

export type {
  HistoryInput,
  HistoryPage,
  HistoryTask,
} from "@/lib/provider-evidence/recovery/adapter";

import type {
  HistoryInput,
  HistoryPage,
  HistoryTask,
} from "@/lib/provider-evidence/recovery/adapter";

function string(value: unknown) {
  return typeof value === "string" ? value : null;
}

function historyTask(value: unknown): HistoryTask | null {
  const task = record(value);
  if (typeof task?.id !== "string" || !task.id) return null;
  const metadata = record(task.metadata);
  const url = string(task.url);
  return {
    id: task.id,
    // The documented ID List representation omits the leading slash.
    endpointPath: url?.startsWith("v3/") ? `/${url}` : url,
    tag: string(metadata?.tag),
    function: string(metadata?.function),
    datetimePosted: string(task.datetime_posted),
    datetimeDone: string(task.datetime_done),
    costCents: nullableCostCents(task.cost),
    metadata,
  };
}

/** Paginates successful pages only. A failure ends iteration; the engine owns retries. */
export async function* listHistory(
  transport: HistoryTransport,
  input: HistoryInput,
  now = new Date(),
): AsyncGenerator<HistoryPage | LookupFailure> {
  const capability = historyCapability(input);
  const expired = metadataWindow(input.from, input.to, now);
  const limit = input.limit ?? 1000;
  let offset = input.offset ?? 0;
  const invalid =
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100_000_000;
  if (capability.kind !== "supported" || expired || invalid) {
    yield capability.kind !== "supported"
      ? capability
      : (expired ?? lookupFailure("operator_review", "invalid_pagination"));
    return;
  }
  while (true) {
    const response = await transport.listIds({
      datetime_from: providerDatetime(input.from),
      datetime_to: providerDatetime(input.to),
      include_metadata: true,
      limit,
      offset,
      sort: "asc",
    });
    if (response.kind !== "response") {
      yield response;
      return;
    }
    const envelope = record(response.body);
    const tasks = array(envelope?.tasks);
    const task = record(tasks[0]);
    if (
      status(envelope).code !== 20000 ||
      tasks.length !== 1 ||
      status(task).code !== 20000 ||
      !Array.isArray(task?.result)
    ) {
      yield lookupFailure("operator_review", "unusable_id_list_response");
      return;
    }
    const rows = array(task.result);
    const parsed = rows.map(historyTask);
    if (parsed.some((row) => row === null)) {
      yield lookupFailure("operator_review", "invalid_id_list_row");
      return;
    }
    const nextOffset = rows.length === limit ? offset + rows.length : null;
    yield {
      kind: rows.length ? "page" : "empty_page",
      tasks: parsed as HistoryTask[],
      nextOffset,
      acceptance: "unknown",
      costCents: null,
      retryable: false,
      suggestedBackoffMs: null,
    };
    if (nextOffset === null) return;
    if (nextOffset > 100_000_000) {
      yield lookupFailure("operator_review", "id_list_pagination_exhausted");
      return;
    }
    offset = nextOffset;
  }
}

export async function getHistoryTask(
  transport: HistoryTransport,
  input: HistoryScope & { id: string; submittedAt: string },
  now = new Date(),
) {
  const capability = historyCapability(input);
  if (capability.kind !== "supported") return capability;
  if (!capability.capability.taskGetPath)
    return lookupFailure("operator_review", "live_result_retrieval_not_evaluated");
  const expired = resultRetention(input.submittedAt, now);
  if (expired) return expired;
  if (!/^[a-zA-Z0-9-]+$/.test(input.id))
    return lookupFailure("operator_review", "invalid_native_task_id");
  const response = await transport.getTask(input.id);
  if (response.kind !== "response") return response;
  const evidence = parseRecoveryGet(response.body);
  if (evidence.tasks.some((task) => task.id !== input.id) || evidence.tasks.length > 1) {
    return lookupFailure("operator_review", "native_task_id_conflict");
  }
  return { kind: "evidence" as const, ...evidence };
}
