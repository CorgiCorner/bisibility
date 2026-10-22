import "server-only";
import { type Actor, AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { providerAvailabilityExpiry } from "@/lib/queries/provider-availability";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend-types";
import { z } from "zod";
import { allocationRows } from "./allocations";
import { type AllocationNativeObservation, allocationIdentity } from "./native-allocation-evidence";
import { loadProviderUiState, type ProviderUiState } from "./state";

const identitySchema = z
  .object({
    id: z.string().min(1).max(200),
    connectionId: z.string().min(1).max(160),
    fundingSource: z.literal("byok"),
    surface: z.enum(["app", "programmatic"]),
    unit: z.enum(["cents", "units"]),
    revision: z.string().min(1).max(160),
  })
  .strict();
type Scope = { actor: Actor; projectPublicId: string };
const readState = (scope: Scope) =>
  prisma.$transaction((tx) => loadProviderUiState(tx, scope.actor, scope.projectPublicId, "read"), {
    isolationLevel: "RepeatableRead",
  });

/** The probe runs between authorized snapshots; a changed key or cap cannot reuse the old row. */
export async function refreshBoundNativeAllocation(
  scope: Scope,
  connectionId: string,
  raw: unknown,
  probe: () => Promise<ProviderSpendConnection>,
  read: (scope: Scope) => Promise<ProviderUiState> = readState,
) {
  const expected = identitySchema.parse(raw);
  if (expected.connectionId !== connectionId) throw new AuthorizationError("forbidden");
  async function capture() {
    const state = await read(scope);
    if (
      !state.usageReadable ||
      state.actor.id !== state.project.ownerId ||
      !state.binding.canManage
    )
      throw new AuthorizationError("forbidden");
    const connection = state.connections.find(
      (c) =>
        c.publicId === connectionId &&
        c.credentialSource === "own" &&
        c.status === "connected" &&
        c.hasStoredCredentials,
    );
    const row = allocationRows(state).find(
      (r) => allocationIdentity(r) === allocationIdentity(expected),
    );
    if (
      !connection ||
      !row?.editable ||
      !(connection.updatedAt instanceof Date) ||
      !Number.isFinite(connection.updatedAt.getTime())
    )
      throw new Error("Provider settings changed. Refresh the budget editor.");
    return { row, epoch: connection.updatedAt.toISOString(), provider: connection.provider };
  }
  const before = await capture();
  const result = await probe();
  const after = await capture();
  if (before.epoch !== after.epoch || before.provider !== after.provider)
    throw new Error("Provider settings changed. Refresh the budget editor.");
  if (
    result.connectionId !== connectionId ||
    result.credentialSource !== "own" ||
    result.providerId !== after.provider
  )
    throw new Error("Provider settings changed. Refresh the budget editor.");
  const value = result.availableAtProvider;
  const expiresAt = providerAvailabilityExpiry(
    value?.status === "available" ? value.checkedAt : undefined,
  );
  let nativeObservation: AllocationNativeObservation | undefined;
  if (
    value?.status === "available" &&
    expiresAt &&
    value.unit === (after.provider === "serpapi" ? "searches" : "usd") &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    (value.unit !== "searches" || Number.isSafeInteger(value.amount))
  ) {
    nativeObservation = {
      identity: {
        id: after.row.id,
        connectionId: after.row.connectionId,
        fundingSource: after.row.fundingSource,
        surface: after.row.surface,
        unit: after.row.unit,
        revision: after.row.revision,
      },
      value: {
        text: String(value.amount),
        unit: value.unit === "usd" ? "USD" : "searches",
        certainty: "measured",
      },
      observedAt: value.checkedAt,
      expiresAt,
    };
  }
  return { ...result, nativeObservation };
}
