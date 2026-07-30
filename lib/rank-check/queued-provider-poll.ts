import "server-only";

import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import type { DataForSeoItem } from "@/lib/providers/serp/dataforseo-payload";
import type { ProviderCredentials } from "@/lib/providers/types";

export type QueuedProviderPollResult<T> =
  | { status: "deadline_reached" }
  | { status: "pending" }
  | { status: "ready"; value: T };

type QueuedProviderPollOptions = {
  deadlineAt?: Date;
};

export function dataForSeoQueuedResponseTask(data: unknown) {
  return (
    data as {
      tasks?: Array<{
        cost?: number;
        result?: Array<{ items?: DataForSeoItem[] }>;
        status_code?: number;
        status_message?: string;
      }>;
    }
  ).tasks?.[0];
}

export async function pollDataForSeoQueue<T>(
  credentials: ProviderCredentials,
  projectId: string,
  request: () => Promise<T>,
  options: QueuedProviderPollOptions = {},
): Promise<QueuedProviderPollResult<T>> {
  const rate = await consumeProviderLimit("dataforseo", credentials, { projectId });
  if (options.deadlineAt && Date.now() >= options.deadlineAt.getTime()) {
    return { status: "deadline_reached" };
  }
  if (!rate.success) return { status: "pending" };

  try {
    return { status: "ready", value: await request() };
  } catch (error) {
    if (error instanceof DataForSeoError && error.retryable) {
      writeCooldown(rate.accountKey);
      return { status: "pending" };
    }
    throw error;
  }
}
