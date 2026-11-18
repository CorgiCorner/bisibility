import { isPublicIdOfType } from "@/lib/db/public-id";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { MODEL_PROVIDER_CATALOG } from "@/lib/providers/model/catalog-metadata";
import type {
  ModelCatalogEntry,
  ModelCatalogSnapshot,
  NativeModelProviderId,
} from "@/lib/providers/model/types";
import { modelPlatformConnectionSchema } from "./funding-input";
import { createModelPlaygroundRunSchema, modelColumnSchema } from "./schema";
import type { ModelColumn, ModelPlaygroundInput } from "./types";

/** Only fields from the existing safe integration projection, never drawer defaults or keys. */
export type ModelConnection = Pick<
  IntegrationProviderData,
  | "id"
  | "name"
  | "status"
  | "connectionId"
  | "enabled"
  | "credentialSource"
  | "hasStoredCredentials"
  | "credentialIssue"
>;
export function connectionReadiness(connection?: ModelConnection) {
  if (!connection || connection.status === "planned") return "unavailable";
  if (connection.enabled === false) return "disabled";
  if (connection.status === "needs_reauth" || connection.credentialIssue) return "reauth";
  if (
    connection.status === "connected" &&
    connection.hasStoredCredentials &&
    connection.connectionId &&
    ((isPublicIdOfType(connection.connectionId, "conn") && connection.credentialSource === "own") ||
      (modelPlatformConnectionSchema.safeParse(connection.connectionId).success &&
        connection.credentialSource === "hosted"))
  )
    return "connected";
  return "missing";
}
export const modelProviderName = (id: NativeModelProviderId) =>
  MODEL_PROVIDER_CATALOG.find((provider) => provider.id === id)?.label ?? id;
export const catalogEntry = (catalogs: readonly ModelCatalogSnapshot[], column: ModelColumn) =>
  catalogs
    .find(
      (catalog) =>
        catalog.providerId === column.providerId &&
        catalog.workspaceId === column.settings.workspaceId,
    )
    ?.models.find((model) => model.modelId === column.modelId);
export function newColumn(model: ModelCatalogEntry, connection: ModelConnection): ModelColumn {
  return {
    columnId: crypto.randomUUID(),
    providerId: model.providerId,
    modelId: model.modelId,
    connectionId: modelColumnSchema.shape.connectionId.parse(connection.connectionId),
    sourceKind: "raw_model",
    settings: { maxOutputTokens: Math.min(1024, model.maxOutputTokens), search: { mode: "off" } },
    payment:
      connection.credentialSource === "hosted"
        ? {
            optionId: modelColumnSchema.shape.connectionId.parse(connection.connectionId),
            fundingSource: "platform",
          }
        : { optionId: `byok:${connection.connectionId}`, fundingSource: "byok" },
  };
}
export function validateComposer(
  input: unknown,
  catalogs: readonly ModelCatalogSnapshot[],
  connections: readonly ModelConnection[],
) {
  let schema: ReturnType<typeof createModelPlaygroundRunSchema>;
  try {
    schema = createModelPlaygroundRunSchema(catalogs, new Date());
  } catch {
    return ["Catalog is unavailable."];
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  return parsed.data.columns.flatMap((column) => {
    const connection = connections.find((item) => item.id === column.providerId);
    return connectionReadiness(connection) === "connected" &&
      connection?.connectionId === column.connectionId
      ? []
      : [`${modelProviderName(column.providerId)}: connection is not ready.`];
  });
}
export function applySearchIntent(
  input: ModelPlaygroundInput,
  catalogs: readonly ModelCatalogSnapshot[],
  enabled: boolean,
  market: string,
): ModelPlaygroundInput {
  return {
    ...input,
    columns: input.columns.map((column) => {
      const tool = catalogEntry(catalogs, column)?.search.find(
        (search) => search.evidence.fixtureRevision,
      );
      return {
        ...column,
        settings: {
          ...column.settings,
          search:
            enabled && tool
              ? {
                  mode: tool.mode,
                  ...(tool.countryHint && market ? { countryCode: market } : {}),
                  ...(tool.maxCalls !== null
                    ? {
                        maxCalls: Math.min(column.settings.search.maxCalls ?? 1, tool.maxCalls, 10),
                      }
                    : {}),
                }
              : { mode: "off" },
        },
      };
    }),
  };
}

/** Display projection kept separate from the strict execution capability snapshot. */
export type ModelDisplayLabels = Partial<
  Record<NativeModelProviderId, Readonly<Record<string, string>>>
>;
export function modelLabel(
  entry: ModelCatalogEntry | undefined,
  fallback: string,
  labels?: ModelDisplayLabels,
) {
  return entry ? (labels?.[entry.providerId]?.[entry.modelId] ?? fallback) : fallback;
}
export function availableModels(
  catalogs: readonly ModelCatalogSnapshot[],
  providerId: string,
  workspaceId?: string,
) {
  return (
    catalogs
      .find(
        (catalog) =>
          catalog.providerId === providerId &&
          catalog.workspaceId === workspaceId &&
          Date.parse(catalog.expiresAt) > Date.now(),
      )
      ?.models.filter((model) => model.availability === "fixture_verified") ?? []
  );
}
export function firstAvailableColumn(
  catalogs: readonly ModelCatalogSnapshot[],
  connections: readonly ModelConnection[],
) {
  for (const connection of connections) {
    const entry = availableModels(catalogs, connection.id)[0];
    if (entry && connectionReadiness(connection) === "connected")
      return newColumn(entry, connection);
  }
  return null;
}
