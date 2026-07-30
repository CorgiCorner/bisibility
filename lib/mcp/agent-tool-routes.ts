type ToolArgs = Record<string, unknown>;
type AgentRestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  projectId?: string;
};

function required(input: ToolArgs, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}

function query(input: ToolArgs, keys: string[]) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

function trafficSnapshotQuery(input: ToolArgs) {
  const params = new URLSearchParams();
  for (const key of ["start_date", "end_date", "limit", "offset"]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  if (Array.isArray(input.paths))
    for (const path of input.paths) if (typeof path === "string") params.append("path", path);
  return params.size ? `?${params}` : "";
}

function project(input: ToolArgs, resource: string) {
  return `/projects/${required(input, "project_id")}/${resource}`;
}

function member(input: ToolArgs, resource: string, key: string, action = "") {
  return `${project(input, resource)}/${required(input, key)}${action}`;
}

function call(
  input: ToolArgs,
  path: string,
  method: AgentRestCall["method"],
  body?: unknown,
): AgentRestCall {
  return {
    body,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

export function dispatchAgentToolRoute(name: string, input: ToolArgs): AgentRestCall | null {
  if (name === "searchLocations")
    return call(input, `/locations/search${query(input, ["q", "country", "limit"])}`, "GET");
  if (name === "listRankedKeywordSuggestions")
    return call(
      input,
      `${project(input, "ranked-keyword-suggestions")}${query(input, ["connection_id", "offset", "limit", "fresh"])}`,
      "GET",
    );
  if (name === "listTrafficSnapshots")
    return call(
      input,
      `${project(input, "analytics/traffic-snapshots")}${trafficSnapshotQuery(input)}`,
      "GET",
    );
  if (name === "listSearchPerformanceQueryStats")
    return call(
      input,
      `${project(input, "analytics/query-stats")}${query(input, ["start_date", "end_date", "connection_id", "query", "limit"])}`,
      "GET",
    );
  if (name === "syncProjectTraffic") return call(input, project(input, "analytics/sync"), "POST");
  if (name === "resendTeamInvite")
    return call(input, member(input, "team/invites", "invite_id", "/resend"), "POST");
  if (name === "updateTeamMemberRole")
    return call(input, member(input, "team/members", "member_id"), "PATCH", {
      role: input.role,
    });
  if (name === "removeTeamMember")
    return call(input, member(input, "team/members", "member_id"), "DELETE");
  return null;
}
