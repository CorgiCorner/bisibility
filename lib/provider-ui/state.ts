import "server-only";
import { createHash } from "node:crypto";
import { type Actor, AuthorizationError, authorize } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { Prisma, type Role } from "@/lib/generated/prisma/client";
import { readOwnConnectionBudgetSnapshot } from "@/lib/metering/own-budget-read";
import type { OwnBudgetRead } from "@/lib/metering/own-budget-read-types";
import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { meteringNamespace } from "@/lib/metering/runtime";
import { readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { ProviderBinding, ProviderRate } from "@usagekit/views";
import { platformAllocationEvidence, platformAllocationProviders } from "./allocation-extension";
import type { NativeAllocationRow } from "./native-allocation-evidence";

export const fingerprint = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export type StoredUiConnection = {
  id: string;
  publicId: string;
  provider: string;
  status: string;
  priority: number;
  enabled: boolean;
  hasStoredCredentials: boolean;
  credentialSource: "own" | "hosted";
  providerUiRevision: string;
  updatedAt: Date;
  rates: { feature: string; amountCents: string; updatedAt: string }[];
};
export type ProviderUiState = Awaited<ReturnType<typeof loadProviderUiState>>;

/** Binding reads omit financial projections; mutations fence concurrent project writers. */
export async function loadProviderUiState(
  tx: Prisma.TransactionClient,
  actor: Actor,
  publicId: string,
  mode: "read" | "mutation" | "binding" = "mutation",
  options: { financialEvidence?: boolean } = {},
) {
  const financialEvidence = mode !== "binding" && options.financialEvidence !== false;
  const reference = await tx.project.findUnique({
    where: { publicId },
    select: { id: true, name: true },
  });
  if (!reference) throw new AuthorizationError("forbidden");
  if (mode === "mutation") await lockProjectForProviderMutation(tx, reference.id);
  const rowLock = mode === "mutation" ? Prisma.sql`FOR SHARE` : Prisma.empty;
  const project = await tx.project.findUniqueOrThrow({
    where: { id: reference.id },
    select: {
      id: true,
      publicId: true,
      ownerId: true,
      isSample: true,
      writeMode: true,
      providerUiRevision: true,
    },
  });
  const users = await tx.$queryRaw<{ role: Role; deactivatedAt: Date | null }[]>`
    SELECT role, "deactivatedAt" FROM users WHERE id=${actor.id} ${rowLock}`;
  const memberships = await tx.$queryRaw<{ projectId: string; role: Role }[]>`
    SELECT "projectId", role FROM memberships
    WHERE "userId"=${actor.id} AND "projectId"=${project.id} ${rowLock}`;
  if (!users[0] || users[0].deactivatedAt) throw new AuthorizationError("forbidden");
  const currentActor: Actor = { id: actor.id, role: users[0].role, memberships };
  const grant = authorize(currentActor, "read", {
    projectId: project.id,
    type: "provider_connection",
  });
  const platforms = await platformAllocationProviders(tx, {
    actor: currentActor,
    projectId: project.id,
  });
  const candidates = await tx.$queryRaw<StoredUiConnection[]>`
    SELECT c.id, c."publicId", c.provider, c.status, c.priority, c.enabled,
      c."credentialsEncrypted" IS NOT NULL AS "hasStoredCredentials", c."credentialSource",
      c."providerUiRevision"::text AS "providerUiRevision", c."updatedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('feature',r.feature,'amountCents',r."amountCents"::text,'updatedAt',r."updatedAt") ORDER BY r.feature)
        FROM provider_connection_rates r WHERE r."connectionId"=c.id),'[]'::jsonb) AS rates
    FROM provider_connections c WHERE c."projectId"=${project.id} ORDER BY c.id`;
  const namespace = meteringNamespace();
  const budgets =
    mode === "binding"
      ? []
      : await readSpendingBudgets(
          tx,
          namespace,
          [
            { kind: "group", namespace, group: project.id },
            ...candidates.flatMap((row) => [
              { kind: "tag" as const, namespace, tag: ownAllocationTag(row.provider, row.id) },
              { kind: "tag" as const, namespace, tag: platformAllocationTag(row.provider, row.id) },
            ]),
          ],
          mode,
        );
  const displayEvidence: { projectLabel?: string; ownEvidence?: OwnBudgetRead[] } = {
    projectLabel: reference.name,
    ownEvidence: [],
  };
  if (
    mode === "read" &&
    financialEvidence &&
    actor.id === project.ownerId &&
    canProjectAction(grant.role, "read", "billing")
  ) {
    for (const connection of candidates) {
      if (connection.credentialSource !== "own") continue;
      const evidence = await readOwnConnectionBudgetSnapshot(tx, {
        namespace,
        actorId: actor.id,
        projectId: project.id,
        connectionId: connection.id,
      });
      if (evidence) displayEvidence.ownEvidence?.push(evidence);
    }
  }
  const budgetVersions = budgets.map((b) => [b.id, b.version]);
  // An old connection without a public alias cannot become a browser command target.
  const connections = candidates.filter((connection) => connection.publicId);
  const platformRates: Record<string, ProviderRate[]> = {};
  const nativeRates: Record<string, ProviderRate[]> = {};
  const platformEvidence = financialEvidence
    ? await platformAllocationEvidence(tx, {
        actor: currentActor,
        projectId: project.id,
      })
    : [];
  const authorities = await tx.$queryRaw<
    { instanceId: string }[]
  >`SELECT "instanceId" FROM provider_ui_authority WHERE id='provider-ui'`;
  if (!authorities[0]) throw new Error("Provider management authority is not initialized.");
  const scopeKey = `bisibility:provider-ui:${authorities[0].instanceId}:${project.publicId}`;
  const revision = fingerprint([
    scopeKey,
    project.providerUiRevision.toString(),
    connections.map((row) => [row.publicId, row.providerUiRevision]),
    platforms,
    budgetVersions,
  ]);
  const binding: ProviderBinding = {
    scopeKey,
    principalKey: actor.id,
    authRevision: fingerprint([
      actor.id,
      users[0].role,
      grant.role,
      project.ownerId,
      project.writeMode,
      project.providerUiRevision.toString(),
      platforms,
    ]),
    canManage:
      canProjectAction(grant.role, "manage", "provider_connection") &&
      project.writeMode === "active" &&
      !project.isSample,
  };
  return {
    ...displayEvidence,
    usageReadable: actor.id === project.ownerId && canProjectAction(grant.role, "read", "billing"),
    nativeAllocationRows: [] as NativeAllocationRow[],
    project,
    budgets,
    actor: currentActor,
    connections,
    platforms,
    platformEvidence,
    platformRates,
    nativeRates,
    binding,
    revision,
  };
}

export const connectionRevision = (state: ProviderUiState, connection: StoredUiConnection) =>
  fingerprint([
    state.binding.scopeKey,
    connection.publicId,
    connection.providerUiRevision,
    state.budgets
      .filter((b) =>
        [
          ownAllocationTag(connection.provider, connection.id),
          platformAllocationTag(connection.provider, connection.id),
        ].includes(b.scope.kind === "tag" ? b.scope.tag : ""),
      )
      .map((b) => [b.id, b.version]),
  ]);
