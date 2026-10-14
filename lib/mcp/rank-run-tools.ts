import { z } from "zod";
import { mcpPublicIdSchema } from "./public-id-schema";
import type { JsonObject } from "./types";

const projectId = z.string().regex(new RegExp(mcpPublicIdSchema("prj").pattern));
const runId = z.string().regex(new RegExp(mcpPublicIdSchema("rcr").pattern));
const schemas = {
  listRankCheckRuns: z
    .object({
      project_id: projectId,
      segment: z.enum(["history", "planned"]).optional(),
      status: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      cursor: z.string().min(1).max(8192).optional(),
    })
    .strict(),
  getRankCheckRun: z.object({ project_id: projectId, run_id: runId }).strict(),
};
export const rankRunToolSchemas = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
);

/** Reuse authenticated REST reads; never submit a check or retry an execution. */
export function dispatchRankRunTool(name: string, input: JsonObject) {
  if (name !== "listRankCheckRuns" && name !== "getRankCheckRun") return null;
  const selection = schemas[name].parse(input);
  let path = `/projects/${encodeURIComponent(selection.project_id)}/rank-check-runs`;
  if ("run_id" in selection) path += `/${encodeURIComponent(selection.run_id)}`;
  const query = new URLSearchParams();
  for (const key of ["segment", "status", "limit", "cursor"]) {
    if (name === "listRankCheckRuns") {
      const value = Reflect.get(selection, key);
      if (typeof value === "string" || typeof value === "number") query.set(key, String(value));
    }
  }
  return {
    method: "GET" as const,
    path: path + (query.size ? `?${query}` : ""),
    projectId: selection.project_id,
  };
}
