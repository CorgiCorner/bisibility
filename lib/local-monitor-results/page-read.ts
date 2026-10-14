import "server-only";
import type { LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { z } from "zod";
import { readMonitorRunHistory } from "./history";
import type { LocalMonitorRunHistory, LocalMonitorRunResult } from "./model";
import { readMonitorRunResult } from "./read";
import { localResultReadSchema } from "./schema";
export async function readLocalResultsPage(
  projectId: string,
  monitorId: string,
  query: Record<string, string | string[] | undefined>,
  context: LocalStoreContext,
) {
  let runHistory: LocalMonitorRunHistory | null = null,
    runResult: LocalMonitorRunResult | null = null;
  try {
    const requestedAsOf = query.asOf === undefined ? undefined : z.string().parse(query.asOf);
    const window = {
      ...(query.from === undefined ? {} : { from: z.string().parse(query.from) }),
      ...(query.to === undefined ? {} : { to: z.string().parse(query.to) }),
    };
    runHistory = await readMonitorRunHistory(
      { projectId, monitorId, ...window, ...(requestedAsOf ? { asOf: requestedAsOf } : {}) },
      context,
    );
    const explicit = Object.hasOwn(query, "run"),
      run = explicit ? z.string().min(1).parse(query.run) : runHistory.items[0]?.runId;
    if (!run) return { runHistory, runResult, resultUnavailable: false };
    const asOf = requestedAsOf ?? runHistory.asOf;
    const input = localResultReadSchema.parse({ projectId, monitorId, runId: run, asOf });
    runResult = await readMonitorRunResult(input, context);
    return { runHistory, runResult, resultUnavailable: false };
  } catch {
    return { runHistory, runResult: null, resultUnavailable: true };
  }
}
