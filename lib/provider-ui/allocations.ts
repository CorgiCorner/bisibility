import { fundingBudgetId } from "@/lib/metering/spending-limits";
import type { ProviderConnectionAllocationUpdate } from "@/lib/provider-allocations/types";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { formatQuantity } from "@usagekit/core";
import type { ProviderAllocationRow } from "@usagekit/views";
import { measuredFigure, unknownFigure } from "./rates";
import type { ProviderUiCommand } from "./schema";
import { connectionRevision, type ProviderUiState } from "./state";

export function allocationRows(state: ProviderUiState): ProviderAllocationRow[] {
  return state.connections.flatMap((connection) => {
    const provider = PROVIDER_CATALOG.find((entry) => entry.id === connection.provider);
    if (provider?.allocation.kind !== "billable") return [];
    const sources = state.platforms.includes(connection.provider)
      ? (["byok", "platform"] as const)
      : (["byok"] as const);
    return sources.flatMap((fundingSource) =>
      ["app", "programmatic"].map((surface) => {
        const unit =
          fundingSource === "platform"
            ? "customer_cents"
            : provider.allocation.kind === "billable"
              ? provider.allocation.allocationUnit
              : "units";
        const budget = state.budgets.find(
          (b) => b.id === fundingBudgetId(connection.id, fundingSource, surface),
        );
        const known = budget !== undefined && budget.unit === unit;
        const limit = budget?.limit;
        const evidence =
          fundingSource === "platform"
            ? state.platformEvidence.find(
                (entry) => entry.connectionId === connection.id && entry.surface === surface,
              )
            : null;
        return {
          id: `${connection.publicId}:${fundingSource}:${surface}`,
          connectionId: connection.publicId,
          label: `${provider.label} · ${connection.publicId}`,
          revision: connectionRevision(state, connection),
          fundingSource,
          surface: surface as "app" | "programmatic",
          unit,
          limit: known && limit ? measuredFigure(formatQuantity(limit), unit) : unknownFigure(unit),
          unlimited: known && limit === null,
          used: evidence?.used ?? unknownFigure(unit),
          reserved: evidence?.reserved ?? unknownFigure(unit),
          remaining: unknownFigure(unit),
          ...(evidence
            ? { available: evidence.available, availabilityBasis: "after_reservations" as const }
            : {}),
          editable: state.binding.canManage === true && (!budget || known),
        } satisfies ProviderAllocationRow;
      }),
    );
  });
}

export function allocationUpdates(
  state: ProviderUiState,
  command: Extract<ProviderUiCommand, { kind: "allocations" }>,
) {
  const rows = allocationRows(state);
  const updates = new Map<string, ProviderConnectionAllocationUpdate>();
  for (const change of command.changes) {
    const row = rows.find((entry) => entry.id === change.rowId);
    if (!row?.editable)
      return { outcome: "invalid" as const, field: "changes", reason: "unsupported_row" };
    if (change.expectedRevision !== row.revision)
      return {
        outcome: "conflict" as const,
        reason: "revision_changed",
        currentRevision: state.revision,
      };
    if (change.limit === undefined) continue;
    // Schema has proved a positive Int bounded exactly before this numeric storage conversion.
    const limit =
      change.limit === null
        ? null
        : {
            amountPerMonth: Number(BigInt(change.limit)),
            unit:
              row.fundingSource === "platform"
                ? ("cents" as const)
                : (row.unit as "cents" | "units"),
          };
    const update = updates.get(row.connectionId) ?? {};
    if (row.fundingSource === "platform")
      update.credits = { ...update.credits, [row.surface]: limit };
    else update[row.surface] = limit;
    updates.set(row.connectionId, update);
  }
  return { outcome: "valid" as const, updates };
}
