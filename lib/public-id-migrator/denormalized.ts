import { createHash } from "node:crypto";
import {
  canonicalJson,
  type PublicIdMaps,
  rewriteAuditRecord,
  rewriteCloudImportManifest,
  rewriteMigrationChunkPayload,
  rewriteNotificationPayload,
  rewriteSavedViewConfig,
} from "./json-rewrite.ts";
import { loadBatchMaps } from "./rewrite-maps.ts";
import type {
  PublicIdMigrationDatabase,
  PublicIdMigrationOptions,
  PublicIdMigrationResult,
} from "./types.ts";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function changed(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

async function inBatchTransaction<T>(
  db: PublicIdMigrationDatabase,
  dryRun: boolean,
  work: () => Promise<T>,
) {
  if (dryRun) return work();
  await db.query("BEGIN");
  try {
    const result = await work();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function rewriteRows(
  db: PublicIdMigrationDatabase,
  table: string,
  columns: string[],
  writableColumns: string[],
  jsonColumns: readonly string[],
  options: PublicIdMigrationOptions,
  result: PublicIdMigrationResult,
  rewrite: (row: Record<string, unknown>, maps: PublicIdMaps) => Record<string, unknown> | null,
) {
  let cursor: string | null = null;
  while (true) {
    const rows = await db.query(
      `SELECT "id", ${columns.map((column) => `"${column}"`).join(", ")}
       FROM "${table}" WHERE ($1::text IS NULL OR "id" > $1) ORDER BY "id" ASC LIMIT $2`,
      [cursor, options.batchSize],
    );
    if (rows.rows.length === 0) return;
    const maps = await loadBatchMaps(db, rows.rows);
    await inBatchTransaction(db, options.dryRun ?? false, async () => {
      const patches = rows.rows.flatMap((row) => {
        const next = rewrite(row, maps);
        if (!next) return [];
        return [
          {
            id: row.id,
            ...Object.fromEntries(
              writableColumns.map((column) => [
                column,
                Object.hasOwn(next, column) ? next[column] : row[column],
              ]),
            ),
          },
        ];
      });
      if (patches.length === 0) return;
      const updated = await db.query(
        `UPDATE "${table}" AS "row"
            SET ${writableColumns.map((column) => `"${column}" = "patch"."${column}"`).join(", ")}
           FROM jsonb_to_recordset($1::jsonb)
             AS "patch"(
               "id" text,
               ${writableColumns
                 .map((column) => `"${column}" ${jsonColumns.includes(column) ? "jsonb" : "text"}`)
                 .join(", ")}
             )
          WHERE "row"."id" = "patch"."id"
          RETURNING "row"."id"`,
        [JSON.stringify(patches)],
      );
      if (updated.rows.length !== patches.length) {
        throw new Error(`Denormalized public ID rewrite was incomplete for ${table}.`);
      }
      result.rewritten += patches.length;
    });
    cursor = stringValue(rows.rows.at(-1)?.id);
    if (rows.rows.length < options.batchSize) return;
  }
}

export async function rewriteDenormalizedIds(
  db: PublicIdMigrationDatabase,
  options: PublicIdMigrationOptions,
  result: PublicIdMigrationResult,
) {
  await rewriteRows(
    db,
    "notifications",
    ["payload"],
    ["payload"],
    ["payload"],
    options,
    result,
    (row, maps) => {
      const payload = rewriteNotificationPayload(maps, row.payload);
      return changed(payload, row.payload) ? { payload } : null;
    },
  );
  await rewriteRows(
    db,
    "saved_views",
    ["config"],
    ["config"],
    ["config"],
    options,
    result,
    (row, maps) => {
      const config = rewriteSavedViewConfig(maps, row.config);
      return changed(config, row.config) ? { config } : null;
    },
  );
  await rewriteRows(
    db,
    "cloud_import_jobs",
    ["manifest"],
    ["manifest"],
    ["manifest"],
    options,
    result,
    (row, maps) => {
      const manifest = rewriteCloudImportManifest(maps, row.manifest);
      return changed(manifest, row.manifest) ? { manifest } : null;
    },
  );
  await rewriteRows(
    db,
    "migration_import_chunks",
    ["kind", "payload", "checksum"],
    ["payload", "checksum"],
    ["payload"],
    options,
    result,
    (row, maps) => {
      const payload = rewriteMigrationChunkPayload(maps, String(row.kind), row.payload);
      const checksum = `sha256:${createHash("sha256")
        .update(canonicalJson({ version: 5, kind: row.kind, ...record(payload) }))
        .digest("hex")}`;
      return changed(payload, row.payload) || checksum !== row.checksum
        ? { checksum, payload }
        : null;
    },
  );
  await rewriteRows(
    db,
    "audit_logs",
    ["action", "targetType", "targetId", "before", "after"],
    ["targetId", "before", "after"],
    ["before", "after"],
    options,
    result,
    (row, maps) => {
      const rewritten = rewriteAuditRecord(maps, {
        action: String(row.action),
        after: row.after,
        before: row.before,
        targetId: String(row.targetId),
        targetType: String(row.targetType),
      });
      const next: Record<string, unknown> = {};
      if (rewritten.targetId !== row.targetId) next.targetId = rewritten.targetId;
      if (changed(rewritten.before, row.before)) next.before = rewritten.before;
      if (changed(rewritten.after, row.after)) next.after = rewritten.after;
      return Object.keys(next).length > 0 ? next : null;
    },
  );
}
