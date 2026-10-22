import { mapAdminQueries } from "@/lib/metering/admin-batch";
import { readCachedProviderAvailability } from "@/lib/queries/provider-availability";
import { allocationRows } from "./allocations";
import {
  type NativeAllocationRow,
  nativeAllocationAvailability,
} from "./native-allocation-evidence";
import type { ProviderUiState } from "./state";

/** Only the owner-authorized snapshot may read cached native account figures. */
export async function loadNativeAllocationRows(
  state: ProviderUiState,
  connectionIds: readonly string[],
) {
  const rows = allocationRows(state).filter((row) => connectionIds.includes(row.connectionId));
  if (!state.usageReadable) {
    state.nativeAllocationRows = rows.map((row) =>
      row.fundingSource === "byok" ? { ...row, availabilityReason: "owner_only" } : row,
    );
    return;
  }
  const connections = state.connections.filter(
    (c) => c.credentialSource === "own" && connectionIds.includes(c.publicId),
  );
  const entries = await mapAdminQueries(
    connections,
    async (connection) => ({
      connectionId: connection.publicId,
      result: await readCachedProviderAvailability(connection),
    }),
    4,
  );
  state.nativeAllocationRows = rows.map((row): NativeAllocationRow => {
    if (row.fundingSource !== "byok") return row;
    const cached = entries.find((entry) => entry?.connectionId === row.connectionId)?.result;
    if (cached?.outcome !== "ready")
      return { ...row, availabilityReason: cached?.reason ?? "balance_unavailable" };
    const identity = {
      id: row.id,
      connectionId: row.connectionId,
      fundingSource: row.fundingSource,
      surface: row.surface,
      unit: row.unit,
      revision: row.revision,
    };
    const nativeObservation = {
      identity,
      value: cached.value,
      observedAt: cached.observedAt,
      expiresAt: cached.expiresAt,
    };
    const available = nativeAllocationAvailability(row, nativeObservation);
    return available.outcome === "ready"
      ? { ...available.row, nativeObservation }
      : { ...row, nativeObservation, availabilityReason: available.reason };
  });
}
