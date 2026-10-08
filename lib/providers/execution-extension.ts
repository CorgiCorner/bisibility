import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MeteringAuthorityCoverage, MeteringAuthorityQuery } from "@/lib/metering/authority";
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

export function hostedRankCheckEstimatedCostCents(
  _provider: string,
  _depth: number,
): number | null {
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

export async function readDeploymentMeteringAuthority(
  _query: MeteringAuthorityQuery,
): Promise<MeteringAuthorityCoverage> {
  return { mode: "legacy", coverage: "none", windows: [] };
}

export async function readDeploymentMeteringExecutionOwner(
  _operationKey: string,
): Promise<"legacy" | "meter" | null> {
  return null;
}

export async function readDeploymentMeteringPreflightAuthority(
  _connectionId: string,
): Promise<"legacy" | "active" | "draining"> {
  return "legacy";
}

export async function readDeploymentMeteringAllocationAuthority(
  _tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  _namespace: string,
  _connectionId: string,
): Promise<"legacy" | "active" | "draining"> {
  return "legacy";
}
