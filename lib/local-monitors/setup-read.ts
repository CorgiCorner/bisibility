import "server-only";
import { canProjectAction } from "@/lib/auth/capabilities";
import { loadBusinessLocation } from "@/lib/business-location-store/location-repository";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { projectRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
import type { SetupChoices } from "./contracts";

const request = z
  .object({
    projectId: projectRef,
    search: z.string().trim().max(120).default(""),
    afterKeyword: z
      .string()
      .refine((id) => isPublicIdOfType(id, "kw"))
      .optional(),
    afterSubject: z
      .string()
      .refine((id) => isPublicIdOfType(id, "biz"))
      .optional(),
  })
  .strict();
/** Bounded, same-project choices. No automatic first subject, provider or geocoding lookup. */
export async function readMonitorSetupChoices(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
): Promise<SetupChoices> {
  const data = request.parse(input);
  return db.$transaction(
    async (tx) => {
      const scope = await localProjectScope(
        tx,
        context,
        data.projectId,
        "read",
        "local_measurement_target",
      );
      const [subjectRows, keywordRows] = await Promise.all([
        tx.businessLocation.findMany({
          where: {
            projectId: scope.project.id,
            state: "active",
            role: "subject",
            ...(data.afterSubject ? { publicId: { gt: data.afterSubject } } : {}),
          },
          select: { publicId: true },
          orderBy: { publicId: "asc" },
          take: 51,
        }),
        tx.keyword.findMany({
          where: {
            projectId: scope.project.id,
            archivedAt: null,
            ...(data.search ? { text: { contains: data.search, mode: "insensitive" } } : {}),
            ...(data.afterKeyword ? { publicId: { gt: data.afterKeyword } } : {}),
          },
          select: { publicId: true, text: true, device: true },
          orderBy: { publicId: "asc" },
          take: 51,
        }),
      ]);
      const subjects = await Promise.all(
        subjectRows.slice(0, 50).map(async (row) => {
          const value = await loadBusinessLocation(tx, scope.project.id, row.publicId);
          const coordinate = value.location.currentRevision.snapshot.coordinates;
          return {
            id: row.publicId,
            name: value.location.currentRevision.snapshot.name,
            identityRevisionId: value.location.currentRevision.id,
            address: value.location.currentRevision.snapshot.address ?? null,
            coordinates: coordinate
              ? { latitude: coordinate.latitude, longitude: coordinate.longitude }
              : null,
          };
        }),
      );
      return {
        subjects,
        keywords: keywordRows
          .slice(0, 50)
          .map((row) => ({ id: row.publicId, text: row.text, device: row.device })),
        subjectsMore: subjectRows.length > 50,
        keywordsMore: keywordRows.length > 50,
        nextSubject: subjectRows.length > 50 ? (subjects.at(-1)?.id ?? null) : null,
        nextKeyword: keywordRows.length > 50 ? (keywordRows[49]?.publicId ?? null) : null,
        permissions: {
          canRead: true,
          canWrite:
            scope.project.writeMode === "active" &&
            canProjectAction(scope.grant.role, "create", "local_measurement_target") &&
            canProjectAction(scope.grant.role, "update", "local_measurement_target"),
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
