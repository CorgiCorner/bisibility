import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import type { ModelPlaygroundCopy } from "./composer-copy";
import {
  catalogEntry,
  connectionReadiness,
  type ModelConnection,
  modelProviderName,
  validateComposer,
} from "./composer-state";
import type { ModelColumn } from "./types";

/** Explain the same capability and connection failures that block the free preview. */
export function columnBlocker(
  column: ModelColumn,
  catalogs: readonly ModelCatalogSnapshot[],
  connections: readonly ModelConnection[],
  copy: ModelPlaygroundCopy,
): string | null {
  const connection = connections.find((item) => item.id === column.providerId);
  const state = connectionReadiness(connection);
  const catalog = catalogs.find(
    (item) =>
      item.providerId === column.providerId && item.workspaceId === column.settings.workspaceId,
  );
  const entry = catalogEntry(catalogs, column);
  let message: string | undefined;
  if (state === "unavailable") message = copy.blockedUnavailable;
  else if (state === "disabled") message = copy.blockedDisabled;
  else if (state === "reauth") message = copy.blockedReauth;
  else if (state !== "connected" || connection?.connectionId !== column.connectionId)
    message = copy.blockedDisconnected;
  else if (catalog && Date.parse(catalog.expiresAt) <= Date.now()) message = copy.blockedCatalog;
  else if (entry?.availability !== "fixture_verified") message = copy.blockedModel;
  else if (
    validateComposer(
      { version: 1, prompt: "Column", responseLanguage: "en", columns: [column] },
      catalogs,
      connections,
    ).length
  )
    message = copy.blockedSettings;
  return (
    message
      ?.replaceAll("{provider}", modelProviderName(column.providerId))
      .replaceAll("{model}", column.modelId) ?? null
  );
}
