import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { modelPlaygroundLaunchSchema } from "./schema";
import { createColumnStore } from "./store-columns";
import {
  type ModelPlaygroundDatabase,
  ModelPlaygroundStoreError,
  type ModelPlaygroundTransaction,
  queryRows,
  requireRow,
  storeTransaction,
} from "./store-db";
import { createPresetStore } from "./store-presets";
import {
  readColumn,
  type StoredColumn,
  storedPreview,
  storedValue,
  storeIdentitySchema,
} from "./store-validation";

interface RunRow {
  id: string;
  projectId: string;
  actorId: string;
  previewId: string;
  configHash: string;
  snapshot: unknown;
  reportId: string | null;
}

export async function readStoredRun(
  tx: ModelPlaygroundTransaction,
  projectId: string,
  runId: string,
) {
  const row = requireRow(
    await queryRows<RunRow>(
      tx,
      `SELECT * FROM model_playground_runs WHERE "projectId"=$1 AND id=$2`,
      projectId,
      runId,
    ),
  );
  const preview = storedPreview(row.snapshot);
  if (
    preview.projectId !== projectId ||
    preview.previewId !== row.previewId ||
    preview.configHash !== row.configHash
  )
    throw new ModelPlaygroundStoreError("invalid_snapshot");
  const columns = await queryRows<StoredColumn>(
    tx,
    `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2`,
    projectId,
    runId,
  );
  if (columns.length !== preview.input.columns.length)
    throw new ModelPlaygroundStoreError("invalid_snapshot");
  const parsed = columns.map((column) => readColumn(column, preview));
  return {
    ...row,
    snapshot: preview,
    columns: preview.input.columns.map((config) =>
      requireRow(parsed.filter((c) => c.columnId === config.columnId)),
    ),
  };
}

/** Storage only. Callers own authorization, catalog/quote validation and paid admission. */
export function createModelPlaygroundStore(db: ModelPlaygroundDatabase) {
  return {
    ...createColumnStore(db),
    ...createPresetStore(db),
    async savePreview(value: unknown, actorId: string) {
      const preview = storedPreview(value);
      storedValue(z.string().min(1).max(256), actorId);
      return storeTransaction(db, async (tx) => {
        await queryRows(
          tx,
          `INSERT INTO model_playground_previews(id,"projectId","actorId",snapshot,"configHash","expiresAt","createdAt")
           VALUES($1,$2,$3,$4::jsonb,$5,$6::timestamptz AT TIME ZONE 'UTC',$7::timestamptz AT TIME ZONE 'UTC')`,
          preview.previewId,
          preview.projectId,
          actorId,
          JSON.stringify(preview),
          preview.configHash,
          preview.expiresAt,
          preview.createdAt,
        );
        return preview;
      });
    },
    async launch(value: unknown) {
      const input = storedValue(
        modelPlaygroundLaunchSchema.omit({ quoteToken: true, byokConsent: true }).extend({
          projectId: z.string().min(1).max(256),
          actorId: z.string().min(1).max(256),
        }),
        value,
      );
      return storeTransaction(db, async (tx) => {
        await queryRows(
          tx,
          `SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1,0))`,
          JSON.stringify(["model-playground", input.projectId, input.requestId]),
        );
        const existing = await queryRows<RunRow>(
          tx,
          `SELECT * FROM model_playground_runs WHERE "projectId"=$1 AND "requestId"=$2`,
          input.projectId,
          input.requestId,
        );
        if (existing.length) {
          const row = existing[0];
          if (
            row.actorId !== input.actorId ||
            row.previewId !== input.previewId ||
            row.configHash !== input.configHash
          )
            throw new ModelPlaygroundStoreError("conflict");
          return readStoredRun(tx, input.projectId, row.id);
        }
        const row = requireRow(
          await queryRows<{ snapshot: unknown }>(
            tx,
            `SELECT snapshot FROM model_playground_previews WHERE "projectId"=$1 AND id=$2
           AND "actorId"=$3 AND "configHash"=$4 AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE`,
            input.projectId,
            input.previewId,
            input.actorId,
            input.configHash,
          ),
        );
        const preview = storedPreview(row.snapshot);
        if (
          preview.projectId !== input.projectId ||
          preview.previewId !== input.previewId ||
          preview.configHash !== input.configHash
        )
          throw new ModelPlaygroundStoreError("conflict");
        const id = randomUUID();
        await queryRows(
          tx,
          `INSERT INTO model_playground_runs(id,"projectId","actorId","requestId","previewId","configHash",snapshot)
           VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          id,
          input.projectId,
          input.actorId,
          input.requestId,
          preview.previewId,
          preview.configHash,
          JSON.stringify(preview),
        );
        for (const column of preview.input.columns) {
          const connection =
            column.payment.fundingSource === "platform"
              ? null
              : requireRow(
                  await queryRows<{ id: string }>(
                    tx,
                    `SELECT id FROM provider_connections WHERE "publicId"=$1 AND "projectId"=$2
               AND provider=$3 AND kind='model' AND "credentialSource"='own' FOR KEY SHARE`,
                    column.connectionId,
                    input.projectId,
                    column.providerId,
                  ),
                );
          await queryRows(
            tx,
            `INSERT INTO model_playground_columns(id,"projectId","runId","columnId","connectionId","providerId",config,"operationKey","liveConnectionId","liveConnectionProjectId")
             VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
            randomUUID(),
            input.projectId,
            id,
            column.columnId,
            column.connectionId,
            column.providerId,
            JSON.stringify(column),
            `model-playground:${id}:${column.columnId}`,
            connection?.id ?? null,
            connection ? input.projectId : null,
          );
        }
        return readStoredRun(tx, input.projectId, id);
      });
    },
    async read(projectId: string, runId: string) {
      storedValue(storeIdentitySchema, { projectId, runId });
      return storeTransaction(db, (tx) => readStoredRun(tx, projectId, runId));
    },
    async attachReport(projectId: string, runId: string, reportId: string) {
      storedValue(storeIdentitySchema, { projectId, runId });
      storedValue(z.string().min(1).max(256), reportId);
      return storeTransaction(db, async (tx) => {
        requireRow(
          await queryRows(
            tx,
            `UPDATE model_playground_runs SET "reportId"=$3 WHERE "projectId"=$1 AND id=$2
           AND ("reportId" IS NULL OR "reportId"=$3) RETURNING id`,
            projectId,
            runId,
            reportId,
          ),
        );
      });
    },
  };
}
