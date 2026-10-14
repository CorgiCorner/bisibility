import "server-only";
import type {
  BusinessLocationDto,
  IdentityRevision,
  IdentitySnapshot,
} from "@/lib/business-locations/dto";
import { identityRevisionSchema } from "@/lib/business-locations/schema";
import type { BusinessIdentityRevision, BusinessLocation } from "@/lib/generated/prisma/client";
import type { BusinessTransaction } from "./context";
import { BusinessLocationConflictError, BusinessLocationUnavailableError } from "./errors";
import { MAX_BUSINESS_VERSION } from "./schema";

export type StoredBusinessLocation = BusinessLocationDto &
  Readonly<{ publicId: string; version: number }>;
export function storedIdentity(row: BusinessIdentityRevision): IdentityRevision {
  return identityRevisionSchema.parse({ ...row, effectiveFrom: row.effectiveFrom.toISOString() });
}
export async function locationIdentity(tx: BusinessTransaction, row: BusinessLocation) {
  if (!row.currentRevisionId) throw new BusinessLocationUnavailableError();
  const revision = await tx.businessIdentityRevision.findFirst({
    where: { projectId: row.projectId, entityId: row.id, id: row.currentRevisionId },
  });
  if (!revision) throw new BusinessLocationUnavailableError();
  return storedIdentity(revision);
}
function locationDto(
  row: BusinessLocation,
  currentRevision: IdentityRevision,
): StoredBusinessLocation {
  if (!["subject", "competitor"].includes(row.role) || !["active", "archived"].includes(row.state))
    throw new BusinessLocationUnavailableError();
  return {
    id: row.id,
    publicId: row.publicId,
    projectId: row.projectId,
    version: row.version,
    role: row.role as StoredBusinessLocation["role"],
    state: row.state as StoredBusinessLocation["state"],
    currentRevision,
  };
}
export async function loadBusinessLocation(
  tx: BusinessTransaction,
  projectId: string,
  publicId: string,
) {
  const row = await tx.businessLocation.findFirst({ where: { projectId, publicId } });
  if (!row) throw new BusinessLocationUnavailableError();
  return { row, location: locationDto(row, await locationIdentity(tx, row)) };
}
export async function loadProjectLocations(
  tx: BusinessTransaction,
  projectId: string,
  activeOnly = false,
) {
  const rows = await tx.businessLocation.findMany({
    where: { projectId, ...(activeOnly ? { state: "active" } : {}) },
    orderBy: { id: "asc" },
  });
  const revisions = await tx.businessIdentityRevision.findMany({
    where: {
      projectId,
      id: {
        in: rows.flatMap(({ currentRevisionId }) => (currentRevisionId ? [currentRevisionId] : [])),
      },
    },
  });
  const byId = new Map(revisions.map((row) => [row.id, row]));
  return rows.map((row) => {
    const revision = row.currentRevisionId ? byId.get(row.currentRevisionId) : null;
    if (!revision || revision.entityId !== row.id) throw new BusinessLocationUnavailableError();
    return locationDto(row, storedIdentity(revision));
  });
}
export function assertLocationVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 0 || version >= MAX_BUSINESS_VERSION)
    throw new BusinessLocationConflictError();
}
export async function replaceIdentifierClaims(
  tx: BusinessTransaction,
  row: Pick<BusinessLocation, "projectId" | "id">,
  identity: IdentityRevision | null,
) {
  await tx.businessIdentifierClaim.deleteMany({
    where: { projectId: row.projectId, entityId: row.id },
  });
  if (!identity?.snapshot.identifiers.length) return;
  try {
    await tx.businessIdentifierClaim.createMany({
      data: identity.snapshot.identifiers.map(({ namespace, engine, type, value }) => ({
        projectId: row.projectId,
        entityId: row.id,
        identityRevisionId: identity.id,
        namespace,
        engine,
        type,
        value,
      })),
    });
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002")
      throw new BusinessLocationConflictError("identifier_claimed");
    throw cause;
  }
}
export function userIdentityPatch(
  input: Partial<Omit<IdentitySnapshot, "identifiers">> & {
    identifiers?: readonly {
      namespace: "google_business";
      engine: "google";
      type: "cid" | "place_id";
      value: string;
    }[];
  },
  recordedAt: string,
  currentIdentifiers: IdentitySnapshot["identifiers"] = [],
): Partial<IdentitySnapshot> {
  const { identifiers, ...identity } = input;
  return {
    ...identity,
    ...(identifiers
      ? {
          identifiers: identifiers.map((identifier) => {
            const retained = currentIdentifiers.find(
              (current) =>
                current.namespace === identifier.namespace &&
                current.engine === identifier.engine &&
                current.type === identifier.type &&
                current.value === identifier.value,
            );
            return (
              retained ?? {
                ...identifier,
                provenance: { source: "user" as const, referenceId: null, recordedAt },
              }
            );
          }),
        }
      : {}),
  };
}
