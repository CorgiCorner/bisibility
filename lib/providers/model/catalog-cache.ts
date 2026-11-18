import "server-only";
import { createHash } from "node:crypto";
import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { z } from "zod";
import { ModelTransportError } from "./errors";
import { modelWorkspaceIdSchema } from "./routing-settings";
import {
  type ModelCatalogSnapshot,
  NATIVE_MODEL_PROVIDERS,
  type NativeModelProviderId,
} from "./types";

const scopeSchema = z
  .object({
    providerId: z.enum(NATIVE_MODEL_PROVIDERS),
    accountDigest: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceId: modelWorkspaceIdSchema.optional(),
    credentialRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ModelCatalogScope = {
  providerId: NativeModelProviderId;
  accountDigest: string;
  credentialRevision: string;
  workspaceId?: string;
};
export const MODEL_CATALOG_CACHE_LIMITS = Object.freeze({
  entries: 32,
  bytes: 4 * 1024 * 1024,
  entryBytes: 512 * 1024,
  ttlMs: 5 * 60_000,
} as const);

type Entry = { json: string; bytes: number; expiresAt: number };

function key(scope: ModelCatalogScope) {
  const parsed = scopeSchema.safeParse(scope);
  if (
    !parsed.success ||
    (parsed.data.workspaceId !== undefined && parsed.data.providerId !== "anthropic")
  )
    throw new ModelTransportError("invalid_request");
  const { providerId, accountDigest, credentialRevision, workspaceId } = parsed.data;
  return createHash("sha256")
    .update(JSON.stringify([providerId, accountDigest, credentialRevision, workspaceId ?? null]))
    .digest("hex");
}

function validateSnapshot(scope: ModelCatalogScope, snapshot: unknown) {
  const parsed = modelCatalogSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new ModelTransportError("invalid_response");
  const value = parsed.data;
  const expiresAt = Math.min(
    Date.parse(value.expiresAt),
    Date.parse(value.fetchedAt) + MODEL_CATALOG_CACHE_LIMITS.ttlMs,
  );
  const json = JSON.stringify(value);
  const bytes = Buffer.byteLength(json);
  if (
    value.workspaceId !== scope.workspaceId ||
    value.providerId !== scope.providerId ||
    value.accountDigest !== scope.accountDigest ||
    Date.parse(value.fetchedAt) > Date.now() ||
    expiresAt <= Date.now() ||
    bytes > MODEL_CATALOG_CACHE_LIMITS.entryBytes
  )
    throw new ModelTransportError("invalid_response");
  return { value, json, bytes, expiresAt };
}

/** Only normalized, strict catalog snapshots enter this bounded process-local LRU. */
export class ModelCatalogCache {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  get(scope: ModelCatalogScope): ModelCatalogSnapshot | null {
    const id = key(scope);
    this.expire();
    const entry = this.entries.get(id);
    if (!entry) return null;
    let snapshot: ModelCatalogSnapshot;
    try {
      if (Buffer.byteLength(entry.json) > MODEL_CATALOG_CACHE_LIMITS.entryBytes)
        throw new ModelTransportError("invalid_response");
      snapshot = validateSnapshot(scope, JSON.parse(entry.json)).value;
    } catch {
      this.remove(id);
      return null;
    }
    this.entries.delete(id);
    this.entries.set(id, entry);
    return snapshot;
  }

  set(scope: ModelCatalogScope, snapshot: ModelCatalogSnapshot): void {
    const id = key(scope);
    const { json, bytes, expiresAt } = validateSnapshot(scope, snapshot);
    this.expire();
    this.remove(id);
    while (
      this.entries.size >= MODEL_CATALOG_CACHE_LIMITS.entries ||
      this.bytes + bytes > MODEL_CATALOG_CACHE_LIMITS.bytes
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.entries.set(id, { json, bytes, expiresAt });
    this.bytes += bytes;
  }

  private remove(id: string) {
    const entry = this.entries.get(id);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(id);
  }

  private expire() {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= Date.now()) this.remove(id);
  }
}
