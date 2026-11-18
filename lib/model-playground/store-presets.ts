import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type ModelPlaygroundDatabase,
  ModelPlaygroundStoreError,
  queryRows,
  requireRow,
  storeTransaction,
} from "./store-db";
import { storedPreview, storedValue, storeIdentitySchema } from "./store-validation";

export function createPresetStore(db: ModelPlaygroundDatabase) {
  return {
    async saveManualPreset(value: unknown) {
      const input = storedValue(
        storeIdentitySchema.extend({ promptId: z.string().min(1).max(256) }),
        value,
      );
      return storeTransaction(db, async (tx) => {
        const run = requireRow(
          await queryRows<{ snapshot: unknown }>(
            tx,
            `SELECT snapshot FROM model_playground_runs WHERE "projectId"=$1 AND id=$2 FOR UPDATE`,
            input.projectId,
            input.runId,
          ),
        );
        const preview = storedPreview(run.snapshot);
        if (preview.projectId !== input.projectId)
          throw new ModelPlaygroundStoreError("invalid_snapshot");
        const existing = await queryRows<{ id: string; promptId: string }>(
          tx,
          `SELECT id,"promptId" FROM model_playground_presets WHERE "projectId"=$1 AND "runId"=$2`,
          input.projectId,
          input.runId,
        );
        if (existing.length) {
          if (existing[0].promptId !== input.promptId)
            throw new ModelPlaygroundStoreError("conflict");
          return existing[0].id;
        }
        const id = randomUUID();
        await queryRows(
          tx,
          `INSERT INTO model_playground_presets(id,"projectId","runId","promptId",config)
           VALUES($1,$2,$3,$4,$5::jsonb)`,
          id,
          input.projectId,
          input.runId,
          input.promptId,
          JSON.stringify(preview.input),
        );
        return id;
      });
    },
  };
}
