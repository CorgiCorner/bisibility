import "server-only";
import type { AssignmentScopeChoice } from "@/lib/business-locations/ui-contracts";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { businessProjectScope } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";

const searchSchema = z
  .object({
    kind: z.enum(["keyword", "market"]),
    search: z.string().trim().max(200),
    after: z.string().min(1).max(100).nullable().default(null),
  })
  .strict();

/** Bounded discovery only. Each selection is authorized again by the assignment reader/writer. */
export async function readBusinessScopeChoices(
  projectId: string,
  input: unknown,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  const data = searchSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read", "business_assignment");
    const common = {
      projectId: scope.project.id,
      ...(data.after ? { publicId: { gt: data.after } } : {}),
    };
    const choices: AssignmentScopeChoice[] =
      data.kind === "keyword"
        ? (
            await tx.keyword.findMany({
              where: {
                ...common,
                archivedAt: null,
                text: { contains: data.search, mode: "insensitive" },
              },
              select: { publicId: true, text: true, location: true, device: true },
              orderBy: { publicId: "asc" },
              take: 51,
            })
          ).map((row) => ({
            scope: { kind: "keyword", id: row.publicId },
            name: row.text,
            location: row.location,
            device: row.device,
          }))
        : (
            await tx.projectMarket.findMany({
              where: {
                ...common,
                status: "active",
                name: { contains: data.search, mode: "insensitive" },
              },
              select: { publicId: true, name: true, location: { select: { displayName: true } } },
              orderBy: { publicId: "asc" },
              take: 51,
            })
          ).map((row) => ({
            scope: { kind: "market", id: row.publicId },
            name: row.name,
            location: row.location.displayName,
            device: null,
          }));
    return {
      choices: choices.slice(0, 50),
      next: choices.length > 50 ? choices[49].scope.id : null,
    };
  });
}
