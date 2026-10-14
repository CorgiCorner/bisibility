import type {
  AuditIntent,
  BusinessLocationDto,
  IdentityRevision,
  IdentitySnapshot,
  TrustedWriteContext,
} from "./dto";
import { businessIdentityNormalizerVersion } from "./dto";
import { IdentityIdentifierClaimedError } from "./identity-errors";
import { identityWithMapsIdentifiers } from "./identity-url-snapshot";
import {
  identityRevisionSchema,
  identitySnapshotSchema,
  referenceSchema,
  timestampSchema,
} from "./schema";

export function assertTrustedWrite(context: TrustedWriteContext, projectId: string) {
  referenceSchema.parse(context.actorId);
  if (
    context.projectId !== projectId ||
    context.canWrite !== true ||
    context.writeMode !== "editable"
  ) {
    throw new Error("Business location write is not authorized.");
  }
}

export function freezeIdentitySnapshot(snapshot: IdentitySnapshot): IdentitySnapshot {
  return Object.freeze({
    ...snapshot,
    ...(snapshot.coordinates ? { coordinates: Object.freeze({ ...snapshot.coordinates }) } : {}),
    identifiers: Object.freeze(
      snapshot.identifiers.map((identifier) =>
        Object.freeze({
          ...identifier,
          provenance: Object.freeze({ ...identifier.provenance }),
        }),
      ),
    ),
  });
}

function identifierKey(identifier: IdentitySnapshot["identifiers"][number]) {
  return JSON.stringify([
    identifier.namespace,
    identifier.engine,
    identifier.type,
    identifier.value,
  ]);
}

export function planIdentityRevision(input: {
  id: string;
  entityId: string;
  projectId: string;
  current: IdentityRevision | null;
  expectedRevision: number;
  patch: Partial<IdentitySnapshot>;
  activeLocations: readonly BusinessLocationDto[];
  context: TrustedWriteContext;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
}): Readonly<{ revision: IdentityRevision; audit: AuditIntent }> {
  assertTrustedWrite(input.context, input.projectId);
  referenceSchema.parse(input.idempotencyKey);
  timestampSchema.parse(input.effectiveFrom);
  const current = input.current ? identityRevisionSchema.parse(input.current) : null;
  if ((current?.revision ?? 0) !== input.expectedRevision)
    throw new Error("Identity revision conflict.");
  if (
    current &&
    (current.entityId !== input.entityId ||
      current.projectId !== input.projectId ||
      current.id === input.id)
  ) {
    throw new Error("Identity revision scope conflict.");
  }
  if (current && Date.parse(input.effectiveFrom) < Date.parse(current.effectiveFrom))
    throw new Error("Identity revision cannot precede its predecessor.");
  const patch = Object.fromEntries(
    Object.entries(input.patch).filter(([, value]) => value !== undefined),
  );
  const snapshot = identityWithMapsIdentifiers(
    identitySnapshotSchema.parse({ ...current?.snapshot, ...patch }),
    input.effectiveFrom,
  );
  const ownKeys = new Set(snapshot.identifiers.map(identifierKey));
  for (const location of input.activeLocations) {
    if (
      location.projectId !== input.projectId ||
      location.id === input.entityId ||
      location.state !== "active"
    )
      continue;
    if (
      location.currentRevision.snapshot.identifiers.some((identifier) =>
        ownKeys.has(identifierKey(identifier)),
      )
    ) {
      throw new IdentityIdentifierClaimedError();
    }
  }
  const parsed = identityRevisionSchema.parse({
    id: input.id,
    entityId: input.entityId,
    projectId: input.projectId,
    revision: (current?.revision ?? 0) + 1,
    previousRevisionId: current?.id ?? null,
    effectiveFrom: input.effectiveFrom,
    normalizerVersion: businessIdentityNormalizerVersion,
    actorId: input.context.actorId,
    reason: input.reason,
    snapshot,
  });
  const revision = Object.freeze({ ...parsed, snapshot: freezeIdentitySnapshot(parsed.snapshot) });
  const audit = Object.freeze({
    action: "business_location.identity_revision" as const,
    projectId: input.projectId,
    actorId: input.context.actorId,
    entityId: input.entityId,
    revisionId: input.id,
    previousId: current?.id ?? null,
    idempotencyKey: input.idempotencyKey,
    recordedAt: input.effectiveFrom,
  });
  return Object.freeze({ revision, audit });
}

/** A monitor never silently picks the first branch or substitutes a competitor. */
export function requireExplicitSubject(
  locations: readonly BusinessLocationDto[],
  input: { projectId: string; entityId: string; identityRevisionId: string },
) {
  const matches = locations.filter(
    (location) => location.projectId === input.projectId && location.id === input.entityId,
  );
  if (matches.length !== 1) throw new Error("An explicit project subject is required.");
  const location = matches[0];
  if (
    location.currentRevision.projectId !== location.projectId ||
    location.currentRevision.entityId !== location.id
  )
    throw new Error("Subject identity scope conflict.");
  if (location.role !== "subject" || location.state !== "active")
    throw new Error("An active subject is required.");
  if (location.currentRevision.id !== input.identityRevisionId)
    throw new Error("Subject identity revision conflict.");
  return location.currentRevision;
}
