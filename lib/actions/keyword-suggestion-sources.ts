"use server";

import { prisma } from "@/lib/db/prisma";
import { listEligibleRankedKeywordConnections } from "@/lib/ranked-keywords/service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const sourcesSchema = z.object({ projectId: z.string().trim().min(1).max(120) });

export async function listKeywordSuggestionSources(input: unknown) {
  const { projectId } = parseActionInput(sourcesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  const [searchConsole, rankedConnections] = await Promise.all([
    prisma.providerConnection.findFirst({
      select: { publicId: true },
      where: { projectId: project.id, provider: "gsc", enabled: true, status: "connected" },
    }),
    listEligibleRankedKeywordConnections(project.id),
  ]);
  return { domain: project.domain, searchConsole: Boolean(searchConsole), rankedConnections };
}
