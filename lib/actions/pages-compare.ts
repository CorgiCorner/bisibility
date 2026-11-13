"use server";

import { loadPagesCompare } from "@/lib/pages/compare";
import { compareMetrics } from "@/lib/pages/compare-model";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const compareSchema = z.object({
  annotation: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
  changed: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
  metric: z.enum(compareMetrics).optional(),
  unchanged: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
});

/** Reads one tag-versus-tag comparison. The selection lives in the URL, not in a saved row. */
export async function loadPagesCompareAction(projectId: string, input: unknown) {
  const data = parseActionInput(compareSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "keyword" },
    { allowReadOnly: true },
  );
  return loadPagesCompare(project.id, {
    annotationId: data.annotation,
    changedTagId: data.changed,
    metric: data.metric,
    unchangedTagId: data.unchanged,
  });
}
