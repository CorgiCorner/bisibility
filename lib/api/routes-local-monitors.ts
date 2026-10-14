import type { ApiContext } from "./context";
import type { LocalMonitorReadSelection } from "./local-monitor-read-input";

export function localMonitorReadRoute(ctx: ApiContext) {
  const [first, projectId, resource, monitorId, fifth, runId, seventh, targetId, ninth] = ctx.path;
  if (
    ctx.method !== "GET" ||
    first !== "projects" ||
    resource !== "local-monitors" ||
    !projectId ||
    !monitorId ||
    fifth !== "runs"
  )
    return null;
  let kind: LocalMonitorReadSelection["kind"] | null = null;
  if (ctx.path.length === 5) kind = "history";
  else if (runId && ctx.path.length === 7 && seventh === "results") kind = "result";
  else if (runId && ctx.path.length === 7 && seventh === "export") kind = "export";
  else if (runId && seventh === "points" && targetId && ctx.path.length === 9) {
    if (ninth === "listings") kind = "listings";
    else if (ninth === "history") kind = "point_history";
  }
  if (!kind) return null;
  const selection = {
    kind,
    projectId,
    monitorId,
    ...(runId ? { runId } : {}),
    ...(targetId ? { targetId } : {}),
  };
  return import("./local-monitor-results").then(({ readLocalMonitorApi }) =>
    readLocalMonitorApi(ctx, selection),
  );
}
