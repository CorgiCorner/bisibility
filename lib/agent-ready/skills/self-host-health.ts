import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "self-host-health",
  title: "Self-host health check",
  description:
    "Run a read-only health and readiness check of a Bisibility instance (hosted or self-hosted): confirm the API is up, inspect capabilities, list projects, verify provider connections, and follow up on async jobs. Use this to triage a slow/failing instance or to verify a fresh deployment before relying on it.",
  compatibility: "Requires a Bisibility origin and a bearer API key with read scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Self-host health check

Performs a fast, read-only assessment of a Bisibility instance so an agent can
answer "is this instance healthy and correctly configured?" without changing any
state. Every call in this workflow is a GET; no \`write\`/\`admin\` scope is needed.

## When to use this skill

- A self-hosted (or hosted) instance is slow, erroring, or behaving oddly and you
  need a structured triage.
- You just deployed/upgraded an instance and want to confirm it is reachable,
  its feature set is what you expect, and providers are still connected.
- Before running any heavier task skill, to confirm the origin + key actually work.

If you need to *change* anything (reconnect a provider, add keywords, mint keys),
stop and hand off to the relevant write/admin skill - this skill is read-only.

## Prerequisites

1. **Resolve the base URL.** Use the EU Cloud origin
   \`https://eu.bisibility.com/api/v1\` or a self-hosted origin
   \`https://your-host.example/api/v1\`. Confirm the exact host with the user;
   do not assume.
2. **API key with \`read\` scope.** Export it as \`BISIBILITY_API_KEY\`
   (e.g. \`bsb_key_live_...\`). Send it as \`Authorization: Bearer $BISIBILITY_API_KEY\`.
   **Never print, echo, or log the key** - reference the env var only.

\`\`\`bash
export BISIBILITY_BASE="https://your-host.example/api/v1"   # or https://eu.bisibility.com/api/v1
export BISIBILITY_API_KEY=placeholder
\`\`\`

## Steps

### 1. Liveness - \`GET /health\` (getHealth)

The cheapest check. A 200 means the API process is up. \`/health\` is typically
unauthenticated, so a failure here points at networking/DNS/TLS or a down
process rather than auth.

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/health"
# -> { "status": "ok", "version": "...", "time": "..." }
\`\`\`

Interpretation: connection refused / timeout = process down or unreachable;
TLS error = cert/proxy issue; 5xx = app started but a dependency is failing.

### 2. Auth + feature set - \`GET /capabilities\` (getCapabilities)

First *authenticated* call. Confirms the key is valid and shows which features,
limits, and provider types this instance supports. A 401/403 here means the key
or its scope is wrong even though the instance is up.

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/capabilities" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Note the supported provider types and any version/limit fields - you will compare
providers against this in step 4, and it tells you if an upgrade landed.

### 3. Inventory - \`GET /projects\` (listProjects)

Lists projects the key can see and confirms the data layer (DB) is reachable.
This is a list endpoint: it returns \`{ "data": [...], "meta": { "next_cursor": "..." } }\`.
Paginate with \`?limit=<n>&cursor=<next_cursor>\` until \`next_cursor\` is absent.

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/projects?limit=50" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

A 200 with \`data: []\` is healthy-but-empty (fresh instance). A 5xx here while
\`/health\` was green usually means the database/migrations are the problem.
Set \`PROJECT_ID\` to one of the returned public project ids before continuing.

### 4. Provider wiring - \`GET /projects/{project_id}/providers\` (listProviders)

For each project of interest (use a \`prj_...\` id from step 3), confirm the
configured providers and their connection status. Look for entries reporting a
disconnected / errored / expired state - those are the most common cause of
"checks stopped running" on an otherwise-up instance.

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/projects/$PROJECT_ID/providers" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Provider credentials are bring-your-own and stored in the instance - they are
never returned in full; do not attempt to read or echo them. To repair a bad
connection, hand off to the **provider-setup** skill.

### 5. Async rank checks - \`GET /rank-checks/{check_id}\` (getRankCheckResult)

Async rank checks return a pollable rank-check id. Poll a known id from a recent
manual or API-triggered check to confirm the worker is executing and persisting
results.

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/rank-checks/rank_..." \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
# -> { "id": "rank_...", "status": "running|completed|failed", "error": null }
\`\`\`

Checks stuck in \`running\` indefinitely indicate the background worker is down
even when the API tier is healthy - flag this explicitly in your summary.

## Reporting

Summarize as a short checklist: liveness, auth/capabilities, projects reachable,
provider status per project, and rank-check execution. Call out the first failing
layer (network -> app -> auth -> database -> providers -> worker) since fixing the
earliest failure usually clears the rest.

## Notes / gotchas

- **Read-only.** Never call write/admin endpoints from this skill.
- **Errors** use \`application/problem+json\`; read the \`title\`/\`detail\` fields for
  the real cause instead of guessing from the status code alone.
- **429 (rate limited)** includes a retry window - back off and respect it; a
  health check should not hammer the instance.
- **Secrets:** reference \`$BISIBILITY_API_KEY\` only; never paste the key or any
  provider credential into output or logs.
- **Layered diagnosis:** \`/health\` passing while \`/capabilities\` or \`/projects\`
  fail isolates the fault to auth or the data layer respectively.`,
  references: [
    {
      path: "references/api.md",
      content: `# Self-host health check - API cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\` (read scope).
List responses: \`{ "data": [...], "meta": { "next_cursor": "..." } }\`;
paginate with \`?limit=<n>&cursor=<next_cursor>\`. Errors: \`application/problem+json\`.
429 carries a retry window. All operations below are read-only GETs.

| METHOD path | operationId | purpose / key fields |
|-|-|-|
| GET /health | getHealth | Liveness; usually unauthenticated. Returns \`status\`, \`version\`. |
| GET /capabilities | getCapabilities | Auth check + supported features, limits, provider types. |
| GET /projects | listProjects | Inventory of visible projects (\`prj_...\`); confirms DB reachable. Supports \`limit\`, \`cursor\`. |
| GET /projects/{project_id}/providers | listProviders | Provider connection status per project. Credentials never returned in full. |
| GET /rank-checks/{check_id} | getRankCheckResult | Async rank-check state: \`status\` = running/completed/failed, plus \`error\`. |

Suggested order: getHealth -> getCapabilities -> listProjects -> listProviders -> getRankCheckResult.
First failing layer (network -> app -> auth -> DB -> providers -> worker) is the
root cause to fix first.
`,
    },
  ],
};
