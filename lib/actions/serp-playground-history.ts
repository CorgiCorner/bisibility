"use server";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { readPlaygroundHistory } from "@/lib/provider-comparison/playground-history";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const inputSchema = z
  .object({
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    query: z.string().trim().max(500),
    page: z.number().int().min(0).max(100000),
  })
  .strict();
export async function readPlaygroundHistoryAction(input: unknown) {
  try {
    const value = inputSchema.parse(input);
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "read", value.projectRef, { type: "keyword" });
    return {
      ok: true as const,
      history: await readPlaygroundHistory(project.id, value.query, value.page),
    };
  } catch {
    return { ok: false as const };
  }
}
