import "server-only";
import { z } from "zod";
import { DefinitionIntegrityError, DefinitionUnavailableError } from "./errors";
import type {
  DefinitionBinding,
  DefinitionHead,
  DefinitionSource,
  DefinitionTransaction,
} from "./model";
import { definitionSourceSchema, requestSchema } from "./schema";

/** All absent is a legitimate legacy install. A partially installed authority is an integrity error. */
export async function definitionAuthorityInstalled(tx: DefinitionTransaction): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ tables: number; source: boolean; guard: boolean }>>`
    SELECT (SELECT count(*)::int FROM unnest(ARRAY['measurement_target_revisions','measurement_policy_revisions','measurement_definition_heads','measurement_execution_bindings']) n WHERE to_regclass(n) IS NOT NULL) AS tables,
      to_regprocedure('measurement_definition_source(text,text)') IS NOT NULL AS source,
      to_regprocedure('measurement_definition_authority_intact()') IS NOT NULL AS guard`;
  const row = rows[0];
  if (row?.tables === 0 && !row.source && !row.guard) return false;
  if (row?.tables !== 4 || !row.source || !row.guard) throw new DefinitionIntegrityError();
  const proof = await tx.$queryRaw<
    Array<{ intact: boolean }>
  >`SELECT measurement_definition_authority_intact() AS intact`;
  if (!proof[0]?.intact) throw new DefinitionIntegrityError();
  return true;
}
export async function readDefinitionSource(
  tx: DefinitionTransaction,
  projectId: string,
  keywordId: string,
): Promise<DefinitionSource> {
  const rows = await tx.$queryRaw<
    Array<{ source: unknown }>
  >`SELECT measurement_definition_source(${projectId},${keywordId}) AS source`;
  if (!rows[0]?.source) throw new DefinitionUnavailableError();
  const result = definitionSourceSchema.safeParse(rows[0].source);
  if (!result.success) throw new DefinitionIntegrityError();
  return result.data;
}
export async function lockDefinitionSource(
  tx: DefinitionTransaction,
  projectId: string,
  keywordId: string,
) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
  const locked = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM keywords WHERE id=${keywordId} AND "projectId"=${projectId} FOR SHARE`;
  if (locked.length !== 1) throw new DefinitionUnavailableError();
  await tx.$queryRaw`SELECT l.id FROM locations l JOIN keywords k ON k."locationId"=l.id WHERE k.id=${keywordId} AND k."projectId"=${projectId} FOR SHARE OF l`;
  await tx.$queryRaw`SELECT c.id FROM check_schedules c JOIN keywords k ON k."checkScheduleId"=c.id WHERE k.id=${keywordId} AND k."projectId"=${projectId} FOR SHARE OF c`;
  // Schedule/default mutations bump the locked project/keyword epoch in the same transaction.
}
const headSchema = z.object({
  targetRevision: z.string(),
  policyRevision: z.string(),
  generation: z.string().regex(/^[1-9]\d*$/u),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  targetSource: definitionSourceSchema.shape.target,
  policySource: definitionSourceSchema.shape.policy,
  epochs: definitionSourceSchema.shape.epochs,
  capturedAt: z.date(),
});
export async function readDefinitionHead(
  tx: DefinitionTransaction,
  projectId: string,
  keywordId: string,
): Promise<DefinitionHead | null> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT h."targetRevisionId" AS "targetRevision",h."policyRevisionId" AS "policyRevision",h.generation::text AS generation,h."sourceFingerprint",t.source AS "targetSource",p.source AS "policySource",h.epochs,h."capturedAt"
    FROM measurement_definition_heads h JOIN measurement_target_revisions t ON t.id=h."targetRevisionId" JOIN measurement_policy_revisions p ON p.id=h."policyRevisionId" WHERE h."projectId"=${projectId} AND h."keywordId"=${keywordId}`;
  if (!rows.length) return null;
  const result = headSchema.safeParse(rows[0]);
  if (!result.success) throw new DefinitionIntegrityError();
  return result.data;
}
const ownerSchema = z
  .object({
    rankCheckId: z.string().min(1).max(256),
    executionKey: z.string().min(1).max(256),
    queuedTaskId: z.string().min(1).max(256).nullable(),
  })
  .strict();
export const bindingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  keywordId: z.string(),
  targetRevision: z.string(),
  policyRevision: z.string(),
  owner: ownerSchema,
  request: requestSchema,
  source: definitionSourceSchema,
  capturedAt: z.date(),
});
export async function readDefinitionBinding(
  tx: DefinitionTransaction,
  projectId: string,
  keywordId: string,
  executionKey: string,
  rankCheckId: string,
): Promise<DefinitionBinding | null> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT id,"projectId","keywordId","targetRevisionId" AS "targetRevision","policyRevisionId" AS "policyRevision",owner,request,source,"capturedAt" FROM measurement_execution_bindings WHERE "projectId"=${projectId} AND "keywordId"=${keywordId} AND "rankCheckId"=${rankCheckId} AND "executionKey"=${executionKey}`;
  if (!rows.length) return null;
  const result = bindingSchema.safeParse(rows[0]);
  if (!result.success) throw new DefinitionIntegrityError();
  return result.data;
}

/** One bounded projection for the authorized target collection, avoiding two roundtrips per keyword. */
export async function readDefinitionMetadataRows(
  tx: DefinitionTransaction,
  projectId: string,
  keywordIds: readonly string[],
) {
  if (!keywordIds.length) return [];
  const rows = await tx.$queryRaw<
    Array<{ keywordId: string; hasHead: boolean; source: unknown } & Record<string, unknown>>
  >`
    SELECT k.id AS "keywordId",h."keywordId" IS NOT NULL AS "hasHead",h."targetRevisionId" AS "targetRevision",h."policyRevisionId" AS "policyRevision",h.generation::text AS generation,h."sourceFingerprint",t.source AS "targetSource",p.source AS "policySource",h.epochs,h."capturedAt",
      CASE WHEN h."keywordId" IS NOT NULL THEN measurement_definition_source(${projectId},k.id) ELSE NULL END AS source
    FROM keywords k LEFT JOIN measurement_definition_heads h ON h."keywordId"=k.id AND h."projectId"=k."projectId"
    LEFT JOIN measurement_target_revisions t ON t.id=h."targetRevisionId" LEFT JOIN measurement_policy_revisions p ON p.id=h."policyRevisionId"
    WHERE k."projectId"=${projectId} AND k.id=ANY(${[...keywordIds]}::text[])`;
  return rows.map((row) => {
    if (!row.hasHead) return { keywordId: row.keywordId, head: null, source: null };
    const head = headSchema.safeParse(row);
    const source = definitionSourceSchema.safeParse(row.source);
    if (!head.success || !source.success) throw new DefinitionIntegrityError();
    return { keywordId: row.keywordId, head: head.data, source: source.data };
  });
}
