import "server-only";

import { randomUUID } from "node:crypto";
import { Client, Connection } from "@temporalio/client";
import type { SearchAttributePair } from "@temporalio/common";
import { RANK_CHECK_WORKFLOW_TYPE, rankCheckWorkflowId } from "../rank-check/workflow-id";
import { assertTemporalSchedulerEnabled } from "../scheduler/driver";
import { temporalConnectionOptions, temporalSdkConnectionOptions } from "./connection-options";
import { temporalDeploymentConfig } from "./deployment-config";
import {
  type RankCheckSearchAttributeInput,
  rankCheckSearchAttributes,
} from "./rank-check-search-attributes";
import type { RankCheckWorkflowInput, RankCheckWorkflowResult } from "./workflows";

// Server-only Temporal client. The workflow is started by name (a string) rather
// than by importing the workflow function, so `@temporalio/workflow` and the
// sandboxed workflow code never get pulled into the Next.js bundle.

const deploymentConfig = temporalDeploymentConfig();
export const TEMPORAL_NAMESPACE = deploymentConfig.namespace;
export const TEMPORAL_TASK_QUEUE = deploymentConfig.taskQueue;

export type { RankCheckSearchAttributeInput };
export { RANK_CHECK_WORKFLOW_TYPE, rankCheckSearchAttributes, rankCheckWorkflowId };

let clientPromise: Promise<Client> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    const options = temporalConnectionOptions();
    const pending = (async () => {
      const connection = await Connection.connect(temporalSdkConnectionOptions(options));
      return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
    })();
    clientPromise = pending;
    void pending.catch(() => {
      if (clientPromise === pending) clientPromise = null;
    });
  }

  return clientPromise;
}

export async function closeTemporalClient(): Promise<void> {
  const pendingClient = clientPromise;
  clientPromise = null;
  if (!pendingClient) return;

  const client = await pendingClient.catch(() => null);
  await client?.connection.close();
}

export type StartRankCheckWorkflowResult = {
  workflowId: string;
  runId: string;
};

export function manualRankCheckWorkflowId(keywordId: string) {
  return `${rankCheckWorkflowId(keywordId)}-${randomUUID()}`;
}

/**
 * Enqueue a durable rank check on the 'rank-checks' task queue. Returns the
 * workflow handle ids; it does not wait for the workflow to complete.
 */
export async function startRankCheckWorkflow(
  input: RankCheckWorkflowInput,
  options?: { searchAttributes?: SearchAttributePair[]; workflowId?: string },
): Promise<StartRankCheckWorkflowResult> {
  assertTemporalSchedulerEnabled();
  const client = await getTemporalClient();
  const workflowId = options?.workflowId ?? manualRankCheckWorkflowId(input.keywordId);

  const handle = await client.workflow.start<
    (input: RankCheckWorkflowInput) => Promise<RankCheckWorkflowResult>
  >(RANK_CHECK_WORKFLOW_TYPE, {
    args: [input],
    typedSearchAttributes: options?.searchAttributes,
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId,
  });

  return { runId: handle.firstExecutionRunId, workflowId: handle.workflowId };
}
