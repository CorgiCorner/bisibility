import {
  localHistoryWindow,
  localPointHistorySchema,
  localPointReadSchema,
  localResultAsOf,
  localResultExportSchema,
  localResultReadSchema,
  localRunHistorySchema,
} from "@/lib/local-monitor-results/schema";
import { z } from "zod";
import type { ApiContext } from "./context";
import { ApiInputError } from "./errors";

export type LocalMonitorReadSelection = {
  kind: "history" | "result" | "listings" | "point_history" | "export";
  projectId: string;
  monitorId: string;
  runId?: string;
  targetId?: string;
};

export function localMonitorReadInput(ctx: ApiContext, selection: LocalMonitorReadSelection) {
  const params = ctx.url.searchParams;
  const history = selection.kind === "history" || selection.kind === "point_history";
  const allowed = new Set([
    "as_of",
    ...(history ? ["from", "to", "cursor"] : []),
    ...(selection.kind === "export" ? ["version", "format"] : []),
  ]);
  for (const key of params.keys())
    if (!allowed.has(key) || params.getAll(key).length !== 1)
      throw new ApiInputError("Unsupported or repeated Local result selection.");
  if (params.has("cursor")) z.string().min(1).max(8000).parse(params.get("cursor"));
  if (selection.kind === "export") z.literal("1").parse(params.get("version") ?? "1");
  const command = {
    projectId: selection.projectId,
    monitorId: selection.monitorId,
    ...(selection.runId === undefined ? {} : { runId: selection.runId }),
    ...(selection.targetId === undefined ? {} : { targetId: selection.targetId }),
    ...(params.has("as_of") ? { asOf: params.get("as_of") } : {}),
    ...(history
      ? {
          ...(params.has("from") ? { from: params.get("from") } : {}),
          ...(params.has("to") ? { to: params.get("to") } : {}),
          ...(params.has("cursor") ? { cursor: params.get("cursor") } : {}),
        }
      : {}),
    ...(selection.kind === "export"
      ? {
          version: 1,
          format: params.get("format") ?? "json",
        }
      : {}),
  };
  const schemas = {
    history: localRunHistorySchema,
    result: localResultReadSchema,
    listings: localPointReadSchema,
    point_history: localPointHistorySchema,
    export: localResultExportSchema,
  };
  const input = schemas[selection.kind].parse(command);
  try {
    const asOf = localResultAsOf(input.asOf);
    if (history)
      localHistoryWindow(
        {
          from: "from" in input ? input.from : undefined,
          to: "to" in input ? input.to : undefined,
        },
        asOf,
      );
  } catch {
    throw new ApiInputError("Invalid Local result time or interval.");
  }
  return input;
}
