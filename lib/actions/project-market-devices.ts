"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import { prisma } from "@/lib/db/prisma";
import { marketDevicesChange } from "@/lib/markets/create-review-change";
import {
  marketDeviceConfirmSchema,
  marketDeviceSelectionSchema,
} from "@/lib/markets/device-targets-input";
import {
  addMarketDeviceTargets,
  previewMarketDeviceTargets,
} from "@/lib/markets/device-targets-service";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { withScheduleActionResult } from "@/lib/schedules/action-result";
import { commitKeywordCreate } from "@/lib/schedules/keyword-create-write";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";
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
  return withScheduleActionResult(() =>
    withCapacityFailure(async () => {
      const { body, review } = splitScheduleReview(raw);
      const input = parseActionInput(marketDeviceConfirmSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "create", input.projectId, {
        type: "keyword",
      });
      requireTrackedDomain(project);
      const { fingerprint: _, ...selection } = input;
      const result = await commitKeywordCreate(
        project.id,
        actor,
        marketDevicesChange(selection),
        review,
        (tx, admission) => addMarketDeviceTargets(tx, actor.id, project.id, input, admission),
      );
      if (result.outcome === "created" && result.created > 0) recordAppAction(actor);
      if (result.outcome === "created") revalidateKeywords();

      return result;
    }),
  );
}
