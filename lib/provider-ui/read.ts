import type { ProviderQuery, ProviderReadResult, ProviderSnapshot } from "@usagekit/views";
import { allocationRows } from "./allocations";
import { connectionView, providerDefinitions } from "./model";
import type { ProviderUiState } from "./state";

export function readProviderUi(state: ProviderUiState, query: ProviderQuery): ProviderReadResult {
  const ids = new Set(state.connections.map((row) => row.publicId));
  if (
    ("connectionId" in query && !ids.has(query.connectionId)) ||
    (query.kind === "allocations" && query.connectionIds.some((id) => !ids.has(id)))
  )
    return { outcome: "forbidden" };
  const base = {
    state: "ok" as const,
    problem: null,
    asOf: new Date().toISOString(),
    revision: state.revision,
  };
  let value: ProviderSnapshot;
  switch (query.kind) {
    case "connections": {
      const connections = state.connections
        .filter((row) => !query.provider || row.provider === query.provider)
        .map((row) => connectionView(state, row));
      value = {
        ...base,
        kind: "connections",
        connections,
        providers: providerDefinitions(state).filter(
          (row) => !query.provider || row.id === query.provider,
        ),
        state: connections.length ? "ok" : "empty",
      };
      break;
    }
    case "details": {
      const connection = state.connections.find((row) => row.publicId === query.connectionId);
      if (!connection) return { outcome: "forbidden" };
      value = {
        ...base,
        kind: "details",
        connection: connectionView(state, connection),
      };
      break;
    }
    case "allocations": {
      const rows = allocationRows(state).filter((row) =>
        query.connectionIds.includes(row.connectionId),
      );
      value = { ...base, kind: "allocations", rows, state: rows.length ? "ok" : "empty" };
      break;
    }
    case "balance":
      value = { ...base, kind: "balance", state: "unavailable", balance: null };
      break;
    case "projection":
      value = { ...base, kind: "projection", state: "unavailable", projection: null };
      break;
  }
  return { outcome: "ok", value };
}
