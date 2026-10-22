"use server";
import { prisma } from "@/lib/db/prisma";
import {
  marketDeviceConfirmSchema,
  marketDeviceSelectionSchema,
} from "@/lib/markets/device-targets-input";
import {
  addMarketDeviceTargets,
  previewMarketDeviceTargets,
} from "@/lib/markets/device-targets-service";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { revalidateKeywords } from "./keyword-helpers";
export async function previewProjectMarketDeviceTargets(raw: unknown) {
  const input = parseActionInput(marketDeviceSelectionSchema, raw);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", input.projectId, { type: "keyword" });
  requireTrackedDomain(project);
  return prisma.$transaction((tx) => previewMarketDeviceTargets(tx, project.id, input), {
    isolationLevel: "RepeatableRead",
  });
}
export async function addProjectMarketDeviceTargets(raw: unknown) {
  const input = parseActionInput(marketDeviceConfirmSchema, raw);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", input.projectId, { type: "keyword" });
  requireTrackedDomain(project);
  const result = await prisma.$transaction((tx) =>
    addMarketDeviceTargets(tx, actor.id, project.id, input),
  );
  if (result.outcome === "created") revalidateKeywords();
  return result;
}
