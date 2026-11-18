import { z } from "zod";
import { MODEL_PLAYGROUND_LIMITS, modelColumnSchema, utf8Bytes } from "./schema";
import { ModelPlaygroundStoreError } from "./store-db";
import {
  type ModelPlaygroundPreview,
  modelColumnResultSchema,
  modelPlaygroundPreviewSchema,
} from "./types";

export function storedValue<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ModelPlaygroundStoreError("invalid_snapshot");
  return parsed.data;
}

export function storedPreview(value: unknown): ModelPlaygroundPreview {
  const parsed = storedValue(modelPlaygroundPreviewSchema, value);
  if (utf8Bytes(JSON.stringify(parsed)) > MODEL_PLAYGROUND_LIMITS.provenanceBytes)
    throw new ModelPlaygroundStoreError("invalid_snapshot");
  return parsed;
}

export const storeIdentitySchema = z
  .object({
    projectId: z.string().min(1).max(256),
    runId: z.uuid(),
  })
  .strict();
export const columnIdentitySchema = storeIdentitySchema.extend({ columnId: z.uuid() });
export const leaseIdentitySchema = columnIdentitySchema.extend({ leaseToken: z.uuid() });

export interface StoredColumn {
  connectionId: string;
  providerId: string;
  liveConnectionId: string | null;
  liveConnectionProjectId: string | null;
  columnId: string;
  config: unknown;
  state: string;
  operationKey: string;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  dispatchStartedAt: Date | null;
  result: unknown;
}

export const storedColumnStateSchema = z.enum([
  "queued",
  "claimed",
  "completed",
  "partial",
  "failed",
  "unknown",
  "cancelled",
]);
export function readColumn(row: StoredColumn, preview: ModelPlaygroundPreview) {
  const config = storedValue(modelColumnSchema, row.config);
  const result = row.result === null ? null : storedValue(modelColumnResultSchema, row.result);
  if (
    row.columnId !== config.columnId ||
    row.connectionId !== config.connectionId ||
    row.providerId !== config.providerId ||
    (row.liveConnectionId === null) !== (row.liveConnectionProjectId === null) ||
    (row.liveConnectionProjectId !== null && row.liveConnectionProjectId !== preview.projectId) ||
    (result === null && !["queued", "claimed", "unknown"].includes(row.state)) ||
    !preview.input.columns.some((column) => JSON.stringify(column) === JSON.stringify(config)) ||
    (result &&
      (result.state !== row.state || JSON.stringify(result.column) !== JSON.stringify(config)))
  )
    throw new ModelPlaygroundStoreError("invalid_snapshot");
  return { ...row, state: storedValue(storedColumnStateSchema, row.state), config, result };
}
