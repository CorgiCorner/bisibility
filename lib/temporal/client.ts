import "server-only";

import { randomUUID } from "node:crypto";
import { Client, Connection } from "@temporalio/client";
import {
  type SearchAttributePair,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from "@temporalio/common";
import {
  isAlreadyStarted,
  RANK_CHECK_RUN_WORKFLOW_TYPE,
  RANK_CHECK_WORKFLOW_TYPE,
  rankCheckWorkflowId,
} from "../rank-check/workflow-id";
import { assertTemporalSchedulerEnabled } from "../scheduler/driver";
import { temporalConnectionOptions, temporalSdkConnectionOptions } from "./connection-options";
import { TEMPORAL_TASK_QUEUE, temporalDeploymentConfig } from "./deployment-config";
import { temporalIntegerSetting } from "./integer-setting";
import {
  type RankCheckSearchAttributeInput,
  rankCheckSearchAttributes,
} from "./rank-check-search-attributes";
import type {
  RankCheckWorkflowInput,
  RankCheckWorkflowResult,
} from "./rank-check-workflow-contract";

// Server-only Temporal client. The workflow is started by name (a string) rather
// than by importing the workflow function, so `@temporalio/workflow` and the
// sandboxed workflow code never get pulled into the Next.js bundle.

const deploymentConfig = temporalDeploymentConfig();
export const TEMPORAL_NAMESPACE = deploymentConfig.namespace;

export type { RankCheckSearchAttributeInput };
export {
  RANK_CHECK_WORKFLOW_TYPE,
  rankCheckSearchAttributes,
  rankCheckWorkflowId,
  TEMPORAL_TASK_QUEUE,
};

let clientPromise: Promise<Client> | null = null;
let lastConnectFailure: { error: unknown; failedAt: number } | null = null;

const DEFAULT_CONNECT_FAILURE_COOLDOWN_MS = 30_000;

export async function getTemporalClient(): Promise<Client> {
  assertTemporalSchedulerEnabled();
  if (!clientPromise) {
    const cooldownMs = temporalIntegerSetting(
      "TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS",
      process.env.TEMPORAL_CONNECT_FAILURE_COOLDOWN_MS,
      DEFAULT_CONNECT_FAILURE_COOLDOWN_MS,
      { min: 100, max: 30_000 },
    );
    if (lastConnectFailure && Date.now() - lastConnectFailure.failedAt < cooldownMs) {
      throw lastConnectFailure.error;
    }

    const options = temporalConnectionOptions();
    const pending = (async () => {
      const connection = await Connection.connect(temporalSdkConnectionOptions(options));
      return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
    })();
    clientPromise = pending;
    void pending.then(
      () => {
        if (clientPromise === pending) lastConnectFailure = null;
      },
      (error: unknown) => {
        if (clientPromise === pending) {
          clientPromise = null;
          lastConnectFailure = { error, failedAt: Date.now() };
        }
      },
    );
  }

  return clientPromise;
}

export async function closeTemporalClient(): Promise<void> {
  const pendingClient = clientPromise;
  clientPromise = null;
  lastConnectFailure = null;
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

export function runItemRankCheckWorkflowId(keywordId: string, runItemId: string) {
  return `${rankCheckWorkflowId(keywordId)}-run-${runItemId}`;
}

/**
 * Enqueue a durable rank check on the 'rank-checks' task queue. Returns the
 * workflow handle ids; it does not wait for the workflow to complete.
 */
export async function startRankCheckWorkflow(
  input: RankCheckWorkflowInput,
  options?: {
    searchAttributes?: SearchAttributePair[];
    workflowId?: string;
    workflowIdReusePolicy?: WorkflowIdReusePolicy;
  },
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
    ...(options?.workflowIdReusePolicy
      ? { workflowIdReusePolicy: options.workflowIdReusePolicy }
      : {}),
  });

  return { runId: handle.firstExecutionRunId, workflowId: handle.workflowId };
}

export async function startRankCheckRunWorkflow(
  input: { runId: string },
  options: { workflowId: string },
): Promise<{ alreadyExists: boolean; workflowId: string }> {
  assertTemporalSchedulerEnabled();
  const client = await getTemporalClient();
  try {
    await client.workflow.start(RANK_CHECK_RUN_WORKFLOW_TYPE, {
      args: [input],
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: options.workflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!isAlreadyStarted(error)) throw error;
    return { alreadyExists: true, workflowId: options.workflowId };
  }
  return { alreadyExists: false, workflowId: options.workflowId };
}
