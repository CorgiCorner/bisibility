import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { businessPermissions, businessProjectScope } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationUnavailableError } from "./errors";
import { loadBusinessLocation, loadProjectLocations, storedIdentity } from "./location-repository";

export async function listBusinessLocationsFor(
  projectId: string,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  if (!isPublicIdOfType(projectId, "prj")) throw new BusinessLocationUnavailableError();
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read");
    return {
      locations: await loadProjectLocations(tx, scope.project.id),
      permissions: businessPermissions(scope),
    };
  });
}
export async function readBusinessLocationFor(
  projectId: string,
  locationId: string,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  if (!isPublicIdOfType(projectId, "prj") || !isPublicIdOfType(locationId, "biz"))
    throw new BusinessLocationUnavailableError();
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read");
    const { row, location } = await loadBusinessLocation(tx, scope.project.id, locationId);
    const history = await tx.businessIdentityRevision.findMany({
      where: { projectId: scope.project.id, entityId: row.id },
      orderBy: { revision: "asc" },
    });
    return {
      location,
      history: history.map(storedIdentity),
      permissions: businessPermissions(scope),
    };
  });
}
