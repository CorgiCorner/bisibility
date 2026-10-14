import { monitorRef } from "@/lib/local-monitor-store/schema";
import { projectRef, runRef, targetRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
import { LocalResultSelectionError } from "./errors";

const iso = z.iso
  .datetime({ precision: 3 })
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
export const localResultReadSchema = z
  .object({ projectId: projectRef, monitorId: monitorRef, runId: runRef, asOf: iso.optional() })
  .strict();
export const localPointReadSchema = localResultReadSchema.extend({ targetId: targetRef }).strict();
const historyFields = {
  from: iso.optional(),
  to: iso.optional(),
  cursor: z.string().max(8000).optional(),
};
export const localPointHistorySchema = localPointReadSchema.extend(historyFields).strict();
export const localRunHistorySchema = z
  .object({
    projectId: projectRef,
    monitorId: monitorRef,
    ...historyFields,
    asOf: iso.optional(),
  })
  .strict();
export const localResultExportSchema = localResultReadSchema
  .extend({ version: z.literal(1), format: z.enum(["csv", "json"]) })
  .strict();
export function localResultAsOf(value: string | undefined, now = new Date()) {
  const at = value ? new Date(iso.parse(value)) : new Date(now.getTime());
  if (!Number.isFinite(at.getTime()) || at.getTime() < 0 || at > now)
    throw new LocalResultSelectionError();
  return at;
}
export type LocalResultReadInput = z.infer<typeof localResultReadSchema>;
export function localHistoryWindow(input: { from?: string; to?: string }, asOf: Date) {
  const from = input.from === undefined ? null : new Date(iso.parse(input.from)),
    to = input.to === undefined ? asOf : new Date(iso.parse(input.to));
  if ((from && (from.getTime() < 0 || from > to)) || to.getTime() < 0 || to > asOf)
    throw new LocalResultSelectionError();
  return {
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
    timeBasis: "occurrence_created_at" as const,
  };
}
export function localHistoryTimeFilter(window: ReturnType<typeof localHistoryWindow>) {
  return {
    ...(window.from === null ? {} : { gte: new Date(window.from) }),
    lte: new Date(window.to),
  };
}
