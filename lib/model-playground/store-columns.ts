import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireModelColumnTransition, storedColumnPhase } from "./column-state";
import { fitsModelResult } from "./result-budget";
import { modelColumnSchema } from "./schema";
import {
  type ModelPlaygroundDatabase,
  ModelPlaygroundStoreError,
  queryRows,
  requireRow,
  storeTransaction,
} from "./store-db";
import { lockModelRun } from "./store-terminal";
import {
  columnIdentitySchema,
  leaseIdentitySchema,
  type StoredColumn,
  storedValue,
} from "./store-validation";
import { modelColumnResultSchema } from "./types";

export function createColumnStore(db: ModelPlaygroundDatabase) {
  return {
    async claim(value: unknown, event: "claim" | "cancel" = "claim") {
      const input = storedValue(
        columnIdentitySchema.extend({ leaseSeconds: z.number().int().min(1).max(900) }),
        value,
      );
      const token = randomUUID();
      return storeTransaction(db, async (tx) => {
        await lockModelRun(tx, input);
        const [current] = await queryRows<StoredColumn>(
          tx,
          `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 FOR UPDATE`,
          input.projectId,
          input.runId,
          input.columnId,
        );
        if (!current || !["queued", "claimed"].includes(current.state) || current.dispatchStartedAt)
          return null;
        requireModelColumnTransition(
          event === "cancel" ? "refused" : "admitted",
          storedColumnPhase(current),
          event,
        );
        const rows = await queryRows<StoredColumn>(
          tx,
          `UPDATE model_playground_columns SET state='claimed',"leaseToken"=$4,
           "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')+($5::int * INTERVAL '1 second')
           WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND "dispatchStartedAt" IS NULL
           AND model_playground_live_connection("projectId","connectionId","liveConnectionId","liveConnectionProjectId","providerId")
           AND (state='queued' OR (state='claimed' AND "leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC'))) RETURNING *`,
          input.projectId,
          input.runId,
          input.columnId,
          token,
          input.leaseSeconds,
        );
        if (!rows.length) return null;
        return { ...rows[0], config: storedValue(modelColumnSchema, rows[0].config) };
      });
    },
    async fenceDispatch(value: unknown) {
      const input = storedValue(leaseIdentitySchema, value);
      return storeTransaction(db, async (tx) => {
        await lockModelRun(tx, input);
        const current = requireRow(
          await queryRows<StoredColumn>(
            tx,
            `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 FOR UPDATE`,
            input.projectId,
            input.runId,
            input.columnId,
          ),
          "stale_lease",
        );
        requireModelColumnTransition("admitted", storedColumnPhase(current), "fence");
        // Commit before paid I/O; P09/P12 must still revalidate credentials and authority at dispatch.
        const row = requireRow(
          await queryRows<StoredColumn>(
            tx,
            `UPDATE model_playground_columns SET "dispatchStartedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
           WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND "leaseToken"=$4
           AND state='claimed' AND "leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AND "dispatchStartedAt" IS NULL
           AND model_playground_live_connection("projectId","connectionId","liveConnectionId","liveConnectionProjectId","providerId") RETURNING *`,
            input.projectId,
            input.runId,
            input.columnId,
            input.leaseToken,
          ),
          "stale_lease",
        );
        return { ...row, config: storedValue(modelColumnSchema, row.config) };
      });
    },
    async complete(value: unknown, evidence: unknown) {
      const input = storedValue(leaseIdentitySchema, value);
      const result = storedValue(modelColumnResultSchema, evidence);
      if (!fitsModelResult(result)) throw new ModelPlaygroundStoreError("invalid_snapshot");
      return storeTransaction(db, async (tx) => {
        await lockModelRun(tx, input);
        const row = requireRow(
          await queryRows<StoredColumn>(
            tx,
            `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 FOR UPDATE`,
            input.projectId,
            input.runId,
            input.columnId,
          ),
        );
        if (
          JSON.stringify(storedValue(modelColumnSchema, row.config)) !==
          JSON.stringify(result.column)
        )
          throw new ModelPlaygroundStoreError("conflict");
        requireModelColumnTransition(
          row.dispatchStartedAt ? "in_flight" : "refused",
          storedColumnPhase(row),
          ["completed", "partial"].includes(result.state) ? "complete" : "fail",
        );
        requireRow(
          await queryRows(
            tx,
            `UPDATE model_playground_columns SET state=$5,result=$6::jsonb,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
           WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND "leaseToken"=$4
           AND state='claimed' AND "leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
           AND ("dispatchStartedAt" IS NOT NULL OR $5 IN ('failed','cancelled')) RETURNING id`,
            input.projectId,
            input.runId,
            input.columnId,
            input.leaseToken,
            result.state,
            JSON.stringify(result),
          ),
          "stale_lease",
        );
      });
    },
    async expireDispatched(value: unknown) {
      const input = storedValue(leaseIdentitySchema, value);
      return storeTransaction(db, async (tx) => {
        await lockModelRun(tx, input);
        const [current] = await queryRows<StoredColumn>(
          tx,
          `SELECT * FROM model_playground_columns WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 FOR UPDATE`,
          input.projectId,
          input.runId,
          input.columnId,
        );
        if (current?.state !== "claimed" || !current.dispatchStartedAt) return false;
        requireModelColumnTransition("in_flight", storedColumnPhase(current), "expire");
        const rows = await queryRows(
          tx,
          `UPDATE model_playground_columns SET state='unknown',"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
           WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND "leaseToken"=$4 AND state='claimed'
           AND "dispatchStartedAt" IS NOT NULL AND COALESCE("leaseExpiresAt",'-infinity')<=(clock_timestamp() AT TIME ZONE 'UTC') RETURNING id`,
          input.projectId,
          input.runId,
          input.columnId,
          input.leaseToken,
        );
        return rows.length === 1;
      });
    },
  };
}
