import "server-only";
import type {
  HostedMeteringEvidence,
  HostedMeteringSnapshot,
} from "@/lib/metering/hosted-snapshot";
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

export async function hostedRankCheckEstimatedCostCents(
  _provider: string,
  _depth: number,
): Promise<number | null> {
  return null;
}

export async function startQueuedDeploymentExecution(
  _batchId: string,
  _beforeReserve?: ReadonlyMap<
    string,
    import("@/lib/metering/paid-attempt-types").NativeRequestGuard
  >,
): Promise<QueuedDeploymentExecution | null> {
  return null;
}

export async function recoverQueuedDeploymentExecution(
  _batchId: string,
): Promise<QueuedDeploymentRecovery | null> {
  return null;
}

export async function queuedDeploymentCredentialsAvailable(_provider: string): Promise<boolean> {
  return false;
}

export async function readDeploymentMeteringSnapshot(
  _operationKey: string,
): Promise<HostedMeteringSnapshot | null> {
  return null;
}
export async function readDeploymentMeteringEvidence(
  _operationKey: string,
): Promise<HostedMeteringEvidence | null> {
  return null;
}

export async function deploymentRankUsesNativeUnits(_provider: string): Promise<boolean> {
  return false;
}
