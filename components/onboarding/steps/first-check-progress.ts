import { itemStatusSchema } from "@/lib/rank-check/runs/contract";
import { runItemStatusCopy } from "@/lib/rank-check/runs/status";
import { z } from "zod";
import type { FirstCheckResultRow } from "./first-check-run-rows";

export type TrackedFirstCheck = Extract<FirstCheckResultRow, { runId: string }>;

const itemSchema = z.object({
  blockedReason: z.string().nullable(),
  keyword: z.object({ publicId: z.string() }),
  rankCheck: z
    .object({
      costCents: z.number().nonnegative().nullable(),
      position: z.number().nullable(),
      provider: z.string(),
      rankingUrl: z.string().nullable(),
      requestedDepth: z.number().int().positive().nullable(),
    })
    .nullable(),
  status: itemStatusSchema,
});

export async function readFirstCheckProgress(
  projectId: string,
  row: TrackedFirstCheck,
  signal: AbortSignal,
): Promise<FirstCheckResultRow> {
  const query = new URLSearchParams({ project: projectId, keyword: row.publicId, limit: "1" });
  const response = await fetch(
    `/api/rank-check-runs/${encodeURIComponent(row.runId)}/items?${query}`,
    {
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw new Error("Check status unavailable");
  const { data } = z.object({ data: z.array(itemSchema) }).parse(await response.json());
  const item = data.find((entry) => entry.keyword.publicId === row.publicId);
  if (!item) throw new Error("Check result unavailable");
  if (item.status === "queued" || item.status === "running") return { ...row, status: item.status };
  if (item.status === "completed") {
    if (!item.rankCheck) throw new Error("Check result unavailable");
    return {
      ...row,
      ...item.rankCheck,
      recordedCostCents: item.rankCheck.costCents,
      requestedDepth: item.rankCheck.requestedDepth ?? undefined,
      status: "completed",
    };
  }
  const copy = runItemStatusCopy(item.status, item.blockedReason);
  return {
    ...row,
    code: "failed",
    message: copy.detail ?? `Check ${copy.label.toLowerCase()}.`,
    status: "failed",
  };
}
