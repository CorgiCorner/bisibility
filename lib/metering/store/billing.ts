import type { BillingImportRecord } from "@usagekit/core";
import type { Clock, Store, StoredBillingImport } from "@usagekit/store";
import {
  billingFamilyId,
  InvalidInput,
  prepareBillingImport,
  readBillingImports,
  validateBillingImportInput,
  validateBillingImportsQuery,
} from "@usagekit/store";
import { lockConnectionAccounting } from "./accounting-lock";
import { recordBillingAlerts } from "./billing-alerts";
import { loadBillingCandidates } from "./billing-candidates";
import { decode, encode, key } from "./codec";
import { lockAccounting, newState, persist, projectUsage } from "./command-state";
import { lock, Prisma, type transactions } from "./sql";

export function billingImports(
  tx: ReturnType<typeof transactions>,
  clock: Clock,
  hook?: () => void,
): Pick<Store, "importBilling" | "billingImports"> {
  return {
    async importBilling(input) {
      const invalid = validateBillingImportInput(input);
      if (invalid) return invalid;
      return tx.write(async (sql) => {
        await lockConnectionAccounting(sql, input.scope.namespace, input.scope.connection);
        const familyId = billingFamilyId(input);
        await lock(sql, `metering:import-family:${familyId}`);
        const [family] = await sql.query<{ latest_import_id: string }>(Prisma.sql`
          SELECT latest_import_id FROM metering_import_family WHERE family_id=${familyId}`);
        const imports = (
          await sql.query<{ identity: string; body: unknown }>(Prisma.sql`
            SELECT identity,body FROM metering_import WHERE family_id=${familyId} ORDER BY recorded_at,import_id`)
        ).map(
          (row): StoredBillingImport => ({
            identity: row.identity,
            record: decode<BillingImportRecord>(row.body),
          }),
        );
        const state = newState(clock);
        await loadBillingCandidates(sql, state, input);
        await lockAccounting(sql, state);
        await projectUsage(sql, state, structuredClone(state.operations));
        const before = {
          ...state,
          operations: structuredClone(state.operations),
          alerts: new Set(state.alerts),
        };
        const prepared = prepareBillingImport(
          input,
          {
            operations: [...state.operations.values()],
            imports,
            latestImportId: family?.latest_import_id ?? null,
          },
          clock.now(),
        );
        if (!prepared.stored) return structuredClone(prepared.result);
        for (const { after } of prepared.changes)
          state.operations.set(key(after.scope.namespace, after.operationId), after);
        prepared.stored.record.alerts = recordBillingAlerts(state, prepared.changes);
        await persist(sql, before, state, hook);
        const { record, identity } = prepared.stored;
        await sql.execute(Prisma.sql`
          INSERT INTO metering_import_family(family_id,latest_import_id) VALUES(${familyId},${record.id})
          ON CONFLICT(family_id) DO UPDATE SET latest_import_id=EXCLUDED.latest_import_id`);
        await sql.execute(Prisma.sql`
          INSERT INTO metering_import(import_id,family_id,namespace,principal,connection,provider,
            file_hash,window_from,window_to,recorded_at,identity,body)
          VALUES(${record.id},${familyId},${record.scope.namespace},${record.scope.principal},
            ${record.scope.connection},${record.provider},${record.fileHash},${new Date(record.window.from)},
            ${new Date(record.window.to)},${new Date(record.recordedAt)},${identity},${encode(record)}::jsonb)`);
        return structuredClone(prepared.result);
      });
    },
    async billingImports(query) {
      const invalid = validateBillingImportsQuery(query);
      if (invalid) throw new InvalidInput(invalid.field, invalid.reason);
      return tx.read(async (sql) => {
        const latest = query.history
          ? Prisma.empty
          : Prisma.sql`AND i.import_id=f.latest_import_id`;
        const records = (
          await sql.query<{ body: unknown }>(Prisma.sql`
            SELECT i.body || CASE WHEN successor.import_id IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('supersededBy',successor.import_id) END AS body
            FROM metering_import i JOIN metering_import_family f USING(family_id)
            LEFT JOIN metering_import successor ON successor.family_id=i.family_id
              AND successor.body->>'supersedes'=i.import_id
            WHERE i.namespace=${query.scope.namespace} AND i.principal=${query.scope.principal}
              AND i.connection=${query.connection} AND i.window_from<${new Date(query.to)}
              AND i.window_to>${new Date(query.from)} ${latest}
            ORDER BY i.recorded_at DESC,i.import_id LIMIT ${(query.limit ?? 1000) + 1}`)
        ).map((row) => decode<BillingImportRecord>(row.body));
        return readBillingImports(records, query, clock.now());
      });
    },
  };
}
