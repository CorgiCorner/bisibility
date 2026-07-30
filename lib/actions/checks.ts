"use server";

import type { CheckRunsView } from "@/lib/checks/contract";
import { parsePublicId } from "@/lib/db/public-id";
import { getCheckRunsView } from "@/lib/queries/check-runs";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const checkRunsCursorSchema = z.object({
  checkedAt: z.string().datetime(),
  id: z.string(),
});

const loadCheckRunsSchema = z.object({
  cursor: checkRunsCursorSchema.nullish(),
  filter: z.enum(["all", "completed", "failed", "running", "deferred", "fallback"]),
  projectId: z.string().min(1),
  provider: z.string().min(1).max(100),
  endAt: z.string().datetime().optional(),
  range: z.enum(["24h", "7d", "30d"]),
  trigger: z.enum(["all", "manual", "scheduled"]),
});

export async function loadCheckRuns(input: unknown): Promise<CheckRunsView> {
  const data = parseActionInput(loadCheckRunsSchema, input);
  const actor = await getActionActor();
  if (data.cursor && parsePublicId(data.cursor.id)?.prefix !== "check") {
    throw new Error("Rank check not found.");
  }
  await requireProjectScope(actor, "read", data.projectId, {
    type: "project",
  });
  const requestNow = new Date();
  const requestedEnd = data.endAt ? new Date(data.endAt) : requestNow;
  const rangeEnd = requestedEnd < requestNow ? requestedEnd : requestNow;

  return getCheckRunsView(data.projectId, {
    cursor: data.cursor ?? undefined,
    limit: 50,
    now: rangeEnd,
    provider: data.provider,
    range: data.range,
    status: data.filter,
    trigger: data.trigger,
  });
}
