import { normalizeDomain } from "@/lib/domains/normalize";
import type { ProviderCredentials, SerpDevice } from "@/lib/providers/types";
import type { DataForSeoQueuePriority } from "@/lib/rank-check/queued-config";
import { QUEUED_RESULT_GET_TIMEOUT_MS } from "@/lib/rank-check/queued-timeouts";
import type { SerpRankLocation } from "@/lib/serp/location";
import { resolveSerpDepth, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/markets";
import { DataForSeoError, redactedMessage } from "./dataforseo-errors";
import { dataForSeoResponseCostCents } from "./dataforseo-payload";

const TASK_POST_URL = "https://api.dataforseo.com/v3/serp/google/organic/task_post";
const TASKS_READY_URL = "https://api.dataforseo.com/v3/serp/google/organic/tasks_ready";
const TASK_GET_URL = "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced";
const TASK_POST_TIMEOUT_MS = 30_000;
const CREATED_STATUS = 20100;

export type DataForSeoQueuedTaskInput = {
  correlationId: string;
  depth: SerpDepth;
  device: SerpDevice;
  domain: string;
  keyword: string;
  location: SerpRankLocation;
  stopOnMatch: boolean;
};

type TaskResponse = {
  cost?: number;
  data?: { tag?: string };
  id?: string;
  result?: Array<{ id?: string; items?: unknown[]; tag?: string }>;
  status_code?: number;
  status_message?: string;
};

type TaskPostResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: TaskResponse[];
};

export class DataForSeoAmbiguousSubmissionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DataForSeoAmbiguousSubmissionError";
  }
}

export function dataForSeoQueuedTaskTag(correlationId: string) {
  return `bisibility:rank:${correlationId}`.slice(0, 255);
}

export function dataForSeoAuthorization(credentials: ProviderCredentials) {
  if (!credentials.login || !credentials.password) {
    throw new DataForSeoError("DataForSEO queued tasks require login and password.");
  }
  return `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`;
}

function taskPayload(input: DataForSeoQueuedTaskInput, priority: DataForSeoQueuePriority) {
  const target = normalizeDomain(input.domain) ?? input.domain;
  return {
    depth: resolveSerpDepth(input.depth),
    device: input.device,
    keyword: input.keyword,
    language_code: input.location.hl,
    ...(input.location.primaryGeoCode === null
      ? { location_name: input.location.primaryGeoName }
      : { location_code: input.location.primaryGeoCode }),
    priority: priority === "high" ? 2 : 1,
    tag: dataForSeoQueuedTaskTag(input.correlationId),
    ...(resolveSerpStopOnMatch(input.stopOnMatch)
      ? {
          find_targets_in: ["organic"],
          stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: target }],
        }
      : {}),
  };
}

function costCents(value: unknown) {
  const cost = Number(value ?? 0);
  return Number.isFinite(cost) && cost > 0 ? Number((cost * 100).toFixed(4)) : 0;
}

async function postTasks(
  credentials: ProviderCredentials,
  body: unknown,
): Promise<TaskPostResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TASK_POST_TIMEOUT_MS);
  try {
    const response = await fetch(TASK_POST_URL, {
      body: JSON.stringify(body),
      headers: {
        Authorization: dataForSeoAuthorization(credentials),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (response.status >= 500) {
      throw new DataForSeoAmbiguousSubmissionError(
        `DataForSEO task submission returned HTTP ${response.status}; acceptance is unknown.`,
      );
    }
    const data = (await response.json()) as TaskPostResponse;
    if (!response.ok) {
      throw new DataForSeoError(
        redactedMessage(
          data.status_message ?? `DataForSEO task submission failed with HTTP ${response.status}.`,
          credentials,
        ),
        response.status === 429,
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof DataForSeoError || error instanceof DataForSeoAmbiguousSubmissionError) {
      throw error;
    }
    throw new DataForSeoAmbiguousSubmissionError(
      "DataForSEO task submission response was not received; acceptance is unknown.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitDataForSeoQueuedTasks(input: {
  credentials: ProviderCredentials;
  priority: DataForSeoQueuePriority;
  tasks: DataForSeoQueuedTaskInput[];
}) {
  if (input.tasks.length === 0 || input.tasks.length > 100) {
    throw new Error("DataForSEO queued submissions require between 1 and at most 100 tasks.");
  }
  const byTag = new Map(
    input.tasks.map((task) => [dataForSeoQueuedTaskTag(task.correlationId), task.correlationId]),
  );
  const data = await postTasks(
    input.credentials,
    input.tasks.map((task) => taskPayload(task, input.priority)),
  );
  const accepted: Array<{
    correlationId: string;
    costCents: number;
    providerTaskId: string;
  }> = [];
  const failed: Array<{ correlationId: string; costCents: number; message: string }> = [];
  for (const task of data.tasks ?? []) {
    const correlationId = task.data?.tag ? byTag.get(task.data.tag) : undefined;
    if (!correlationId) continue;
    if (task.status_code === CREATED_STATUS && task.id) {
      accepted.push({ correlationId, costCents: costCents(task.cost), providerTaskId: task.id });
    } else {
      failed.push({
        correlationId,
        costCents: costCents(task.cost),
        message: task.status_message ?? "DataForSEO rejected the queued task.",
      });
    }
  }
  const accounted = new Set([...accepted, ...failed].map((task) => task.correlationId));
  for (const task of input.tasks) {
    if (!accounted.has(task.correlationId)) {
      failed.push({
        correlationId: task.correlationId,
        costCents: 0,
        message: "DataForSEO did not return a task result for this correlation.",
      });
    }
  }
  return { accepted, failed };
}

type QueuedGetOptions = {
  signal?: AbortSignal;
};

async function getEnvelope(
  url: string,
  credentials: ProviderCredentials,
  options: QueuedGetOptions = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("DataForSEO queued GET exceeded its local deadline.")),
    QUEUED_RESULT_GET_TIMEOUT_MS,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: dataForSeoAuthorization(credentials),
        "Content-Type": "application/json",
      },
      signal,
    });
    const data = (await response.json()) as TaskPostResponse;
    if (!response.ok || data.status_code !== 20000) {
      throw new DataForSeoError(
        redactedMessage(
          data.status_message ?? `DataForSEO request failed with HTTP ${response.status}.`,
          credentials,
        ),
        response.status === 429 || response.status >= 500,
        response.status,
        dataForSeoResponseCostCents(data),
      );
    }
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error;
    if (error instanceof DataForSeoError) throw error;
    throw new DataForSeoError("DataForSEO queued result request failed.", true, undefined, null);
  } finally {
    clearTimeout(timeout);
  }
}

export async function readyDataForSeoQueuedTasks(
  credentials: ProviderCredentials,
  expectedTags: ReadonlySet<string>,
  options: QueuedGetOptions = {},
) {
  const data = await getEnvelope(TASKS_READY_URL, credentials, options);
  return (data.tasks ?? []).flatMap((task) =>
    (task.result ?? []).flatMap((result) =>
      result.id && result.tag && expectedTags.has(result.tag)
        ? [{ providerTaskId: result.id, tag: result.tag }]
        : [],
    ),
  );
}

export async function fetchDataForSeoQueuedResult(
  credentials: ProviderCredentials,
  providerTaskId: string,
  options: QueuedGetOptions = {},
) {
  return getEnvelope(`${TASK_GET_URL}/${encodeURIComponent(providerTaskId)}`, credentials, options);
}
