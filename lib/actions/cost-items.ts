"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateBudgetViews,
} from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { type CostItemInput, costItemInputSchema } from "@/lib/cost-items/input";
import {
  CostItemError,
  endCostItem,
  insertCostItem,
  removeCostItem,
  replaceCostItem,
} from "@/lib/cost-items/persist";
import { z } from "zod";

const idSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  publicId: z.string().trim().min(1).max(80),
});

async function linkedProjects(
  actor: Awaited<ReturnType<typeof getActionActor>>,
  current: { id: string; ownerId: string },
  ids: string[],
) {
  const projects = [];
  for (const publicId of [...new Set(ids)]) {
    const project = await requireProjectScope(actor, "manage", publicId, { type: "project" });
    if (project.ownerId !== current.ownerId) throw new CostItemError("project_owner");
    projects.push(project);
  }
  if (!projects.some((project) => project.id === current.id)) throw new CostItemError("missing");
  return projects;
}

async function save(input: CostItemInput, mode: "create" | "update") {
  const actor = await getActionActor();
  const current = await requireProjectScope(actor, "manage", input.projectId, { type: "project" });
  const projects = await linkedProjects(
    actor,
    current,
    input.projects.map((project) => project.projectPublicId),
  );
  if (mode === "create") await insertCostItem(actor.id, current, projects, input);
  else await replaceCostItem(actor.id, current, projects, input);
  recordAppAction(actor);
  revalidateBudgetViews();
}

export async function createCostItemAction(input: unknown) {
  await save(parseActionInput(costItemInputSchema, input), "create");
}

export async function updateCostItemAction(input: unknown) {
  const data = parseActionInput(costItemInputSchema, input);
  if (!data.publicId) throw new CostItemError("missing");
  await save(data, "update");
}

export async function endCostItemAction(input: unknown) {
  const data = parseActionInput(idSchema, input);
  const actor = await getActionActor();
  const current = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  await endCostItem(actor.id, current, data.publicId);
  recordAppAction(actor);
  revalidateBudgetViews();
}

export async function deleteCostItemAction(input: unknown) {
  const data = parseActionInput(idSchema, input);
  const actor = await getActionActor();
  const current = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  await removeCostItem(actor.id, current, data.publicId);
  recordAppAction(actor);
  revalidateBudgetViews();
}
