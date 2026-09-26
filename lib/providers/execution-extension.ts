import "server-only";

import type {
  DeploymentExecution,
  DeploymentExecutionInput,
  DeploymentRankReservation,
  DeploymentRankReservationInput,
  DeploymentReservationClient,
  QueuedDeploymentExecution,
  QueuedDeploymentRecovery,
} from "@/lib/providers/execution-extension-types";

export type {
  DeploymentExecution,
  DeploymentExecutionInput,
} from "@/lib/providers/execution-extension-types";

export async function startDeploymentExecution(
  _input: DeploymentExecutionInput,
): Promise<DeploymentExecution | null> {
  return null;
}

export async function quoteDeploymentRankReservations(
  _client: DeploymentReservationClient,
  _input: DeploymentRankReservationInput,
): Promise<DeploymentRankReservation | null> {
  return null;
}

export async function startQueuedDeploymentExecution(
  _batchId: string,
): Promise<QueuedDeploymentExecution | null> {
  return null;
}

export async function recoverQueuedDeploymentExecution(
  _batchId: string,
): Promise<QueuedDeploymentRecovery | null> {
  return null;
}

export function queuedDeploymentCredentialsAvailable(_provider: string): boolean {
  return false;
}
