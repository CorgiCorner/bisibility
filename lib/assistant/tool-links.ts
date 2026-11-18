import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { appPath } from "@/lib/routing/app-path";
import { projectRunAiPath, projectRunRankCheckPath } from "@/lib/routing/project-runs-path";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function findId(value: unknown, accept: (id: string) => boolean, depth = 0): string | null {
  if (depth > 4) return null;
  const record = object(value);
  for (const key of ["id", "public_id", "run_id", "report_id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && accept(candidate)) return candidate;
  }
  for (const item of Object.values(record)) {
    const found = findId(item, accept, depth + 1);
    if (found) return found;
  }
  return null;
}
export function assistantResultLink(toolName: string, args: unknown, result: unknown) {
  const project = object(args).project_id;
  if (typeof project !== "string" || !isPublicIdOfType(project, "prj")) return null;
  const payload = object(result).payload;
  const data = object(object(payload).data);
  const status =
    typeof data.status === "string" && /^[a-z_]{1,30}$/.test(data.status) ? data.status : "unknown";
  if (["run_rank_check", "get_rank_check_run"].includes(toolName)) {
    const id = findId(payload, (value) => isPublicIdOfType(value, "rcr"));
    if (id)
      return {
        id,
        href: projectRunRankCheckPath(project, id),
        label: "Open rank check run",
        status,
        kind: "run" as const,
      };
  }
  if (
    ["create_prompt_tracker_run", "retry_prompt_tracker_run", "get_prompt_tracker_run"].includes(
      toolName,
    )
  ) {
    const id = findId(payload, (value) => isPublicIdOfType(value, "air"));
    if (id)
      return {
        id,
        href: projectRunAiPath(project, id),
        label: "Open tracking run",
        status,
        kind: "run" as const,
      };
  }
  if (
    ["create_agent_report", "get_agent_report", "run_site_audit", "get_site_audit"].includes(
      toolName,
    )
  ) {
    const id = findId(payload, (value) => isPublicIdOfType(value, "agr"));
    if (id)
      return {
        id,
        href: appPath(project, "agent-reports", id),
        label: "Open report",
        status,
        kind: "report" as const,
      };
  }
  return null;
}
