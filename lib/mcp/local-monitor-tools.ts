import { z } from "zod";
import { mcpPublicIdSchema } from "./public-id-schema";
import type { JsonObject } from "./types";

const id = (prefix: "prj" | "lmn" | "lmr" | "lmt") =>
  z.string().regex(new RegExp(mcpPublicIdSchema(prefix).pattern));
const date = z.iso.datetime({ precision: 3 });
const project = { project_id: id("prj"), monitor_id: id("lmn"), as_of: date.optional() };
const run = { ...project, run_id: id("lmr") };
const point = { ...run, target_id: id("lmt") };
const history = {
  from: date.optional(),
  to: date.optional(),
  cursor: z.string().min(1).max(8000).optional(),
};
const schemas = {
  listLocalMonitorRuns: z.object({ ...project, ...history }).strict(),
  getLocalMonitorRunResults: z.object(run).strict(),
  listLocalMonitorPointListings: z.object(point).strict(),
  listLocalMonitorPointHistory: z.object({ ...point, ...history }).strict(),
  exportLocalMonitorRun: z.object({ ...run, version: z.literal("1").optional() }).strict(),
};
export const localMonitorToolSchemas = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
);

export function isLocalMonitorTool(name: string) {
  return Object.hasOwn(schemas, name);
}

export function dispatchLocalMonitorTool(name: string, input: JsonObject) {
  if (!isLocalMonitorTool(name)) return null;
  const entry = Object.entries(schemas).find(([key]) => key === name);
  if (!entry) throw new Error("Unknown Local read operation");
  const selection = entry[1].parse(input);
  let path = `/projects/${encodeURIComponent(selection.project_id)}/local-monitors/${encodeURIComponent(selection.monitor_id)}/runs`;
  if ("run_id" in selection && typeof selection.run_id === "string")
    path += `/${encodeURIComponent(selection.run_id)}`;
  if ("target_id" in selection && typeof selection.target_id === "string")
    path += `/points/${encodeURIComponent(selection.target_id)}`;
  if (name === "getLocalMonitorRunResults") path += "/results";
  if (name === "listLocalMonitorPointListings") path += "/listings";
  if (name === "listLocalMonitorPointHistory") path += "/history";
  if (name === "exportLocalMonitorRun") path += "/export";
  const query = new URLSearchParams();
  for (const key of ["as_of", "from", "to", "cursor"]) {
    const value = input[key];
    if (typeof value === "string") query.set(key, value);
  }
  if (name === "exportLocalMonitorRun") {
    query.set("version", "1");
    query.set("format", "json");
  }
  return {
    method: "GET" as const,
    path: path + (query.size ? `?${query}` : ""),
    projectId: selection.project_id,
  };
}
