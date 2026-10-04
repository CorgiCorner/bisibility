"use server";

import { extendSnapshot } from "@/lib/serp/extend-snapshot";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";

const schema = z.object({
  projectId: z.string().min(1).max(120),
  checkId: z.string().regex(/^check_[a-zA-Z0-9]+$/),
  nextStart: z.number().int().min(10).max(90).multipleOf(10),
});

export async function extendSerpSnapshot(input: unknown) {
  const data = parseActionInput(schema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const result = await extendSnapshot({ ...data, actorId: actor.id, projectId: project.id });
  revalidateRankCheckViews();
  return result;
}
