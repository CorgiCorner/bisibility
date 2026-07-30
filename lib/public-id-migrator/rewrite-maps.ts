import {
  legacyPublicIdEntityByPrefix,
  type PublicIdMigrationEntity,
  publicIdMigrationEntityByObservedPrefix,
} from "./entities.ts";
import { auditTargetPublicIdEntity, type PublicIdMaps } from "./json-rewrite.ts";
import type { PublicIdMigrationDatabase } from "./types.ts";

type RewriteReference = {
  entity: PublicIdMigrationEntity;
  id: string;
  required: boolean;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function observedReference(value: string): RewriteReference | null {
  const match = /^([a-z]+)_([a-z][a-z0-9]{23})$/.exec(value);
  if (!match) return null;
  const prefix = match[1];
  const entity = publicIdMigrationEntityByObservedPrefix[prefix];
  if (!entity) return null;
  return {
    entity,
    id: value,
    required: prefix in legacyPublicIdEntityByPrefix,
  };
}

function collectExternalReferences(value: unknown, output: Map<string, RewriteReference>) {
  if (typeof value === "string") {
    for (const candidate of [value, ...value.split(/[/?#&=]/)]) {
      const reference = observedReference(candidate);
      if (reference) output.set(`${reference.entity}\0${reference.id}`, reference);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExternalReferences(item, output);
    return;
  }
  const object = record(value);
  if (!object) return;
  for (const [key, item] of Object.entries(object)) {
    collectExternalReferences(key, output);
    collectExternalReferences(item, output);
  }
}

function addMapValue(
  maps: Map<PublicIdMigrationEntity, Map<string, string>>,
  entity: PublicIdMigrationEntity,
  from: string,
  to: string,
) {
  const entityMap = maps.get(entity) ?? new Map<string, string>();
  entityMap.set(from, to);
  maps.set(entity, entityMap);
}

function assertRequiredMappings(
  references: readonly RewriteReference[],
  maps: Map<PublicIdMigrationEntity, Map<string, string>>,
  label: string,
) {
  const missing = references.filter(
    (reference) => reference.required && !maps.get(reference.entity)?.has(reference.id),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing ${label} public ID mappings for ${missing
        .slice(0, 5)
        .map((reference) => `${reference.entity}:${reference.id}`)
        .join(", ")}.`,
    );
  }
}

export async function loadBatchMaps(
  db: PublicIdMigrationDatabase,
  rows: readonly Record<string, unknown>[],
): Promise<PublicIdMaps> {
  const externalReferences = new Map<string, RewriteReference>();
  const internalReferences = new Map<string, RewriteReference>();
  for (const row of rows) {
    collectExternalReferences(row, externalReferences);
    const targetType = stringValue(row.targetType);
    const targetId = stringValue(row.targetId);
    const entity = targetType ? auditTargetPublicIdEntity(targetType) : null;
    if (entity && targetId && !observedReference(targetId)) {
      const reference = { entity, id: targetId, required: true };
      internalReferences.set(`${entity}\0${targetId}`, reference);
    }
  }

  const external = new Map<PublicIdMigrationEntity, Map<string, string>>();
  const externalList = [...externalReferences.values()];
  if (externalList.length > 0) {
    const mappings = await db.query(
      `SELECT "migration"."entityType",
              "migration"."oldExternalId",
              "migration"."newPublicId"
         FROM unnest($1::text[], $2::text[]) AS "reference"("entityType", "lookupId")
         JOIN "public_id_v3_migrations" AS "migration"
           ON "migration"."entityType" = "reference"."entityType"
          AND "migration"."oldExternalId" = "reference"."lookupId"`,
      [
        externalList.map((reference) => reference.entity),
        externalList.map((reference) => reference.id),
      ],
    );
    for (const row of mappings.rows) {
      const entity = stringValue(row.entityType) as PublicIdMigrationEntity | null;
      const oldId = stringValue(row.oldExternalId);
      const newId = stringValue(row.newPublicId);
      if (entity && oldId && newId) addMapValue(external, entity, oldId, newId);
    }
    assertRequiredMappings(externalList, external, "");
  }

  const internal = new Map<PublicIdMigrationEntity, Map<string, string>>();
  const internalList = [...internalReferences.values()];
  if (internalList.length > 0) {
    const mappings = await db.query(
      `SELECT "migration"."entityType",
              "migration"."internalId",
              "migration"."newPublicId"
         FROM unnest($1::text[], $2::text[]) AS "reference"("entityType", "lookupId")
         JOIN "public_id_v3_migrations" AS "migration"
           ON "migration"."entityType" = "reference"."entityType"
          AND "migration"."internalId" = "reference"."lookupId"`,
      [
        internalList.map((reference) => reference.entity),
        internalList.map((reference) => reference.id),
      ],
    );
    for (const row of mappings.rows) {
      const entity = stringValue(row.entityType) as PublicIdMigrationEntity | null;
      const internalId = stringValue(row.internalId);
      const newId = stringValue(row.newPublicId);
      if (entity && internalId && newId) addMapValue(internal, entity, internalId, newId);
    }
    assertRequiredMappings(internalList, internal, "internal");
  }
  return { external, internal } as PublicIdMaps;
}
