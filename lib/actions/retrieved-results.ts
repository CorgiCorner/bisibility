"use server";

import type { RetrievedResults } from "@/lib/checks/contract";
import { loadRetrievedResultsForChecks } from "@/lib/queries/retrieved-results";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const inputSchema = z.object({
  checkIds: z.array(z.string().trim().min(1)).min(1).max(2),
  projectId: z.string().trim().min(1).max(120),
});

export async function loadRetrievedResults(input: unknown): Promise<RetrievedResults[]> {
  const { checkIds, projectId } = parseActionInput(inputSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "keyword" });
  return loadRetrievedResultsForChecks({ checkIds, projectId: project.id });
}
