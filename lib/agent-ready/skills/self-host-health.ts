import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "self-host-health",
  title: "Self-host health check",
  description:
    "Diagnose a hosted or self-hosted bisibility instance using read-only liveness, readiness and health evidence. Inspect project wiring and known runs only when relevant to the symptom; distinguish verified failures from missing signals.",
  compatibility: "Requires a bisibility origin and a bearer API key with read scope.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Self-host health check

Run a read-only diagnosis of a hosted or self-hosted instance. Identify what is
verified, what failed and which layer needs attention. Every operation here is a
GET; no repairs, provider probes, restarts or new rank checks are performed.

## Prerequisites

Resolve \`$BISIBILITY_BASE\` including \`/api/v1\` and a read-scoped bearer credential
in \`$BISIBILITY_API_KEY\`. Never print the credential or provider secrets. A valid
credential enables detailed health; anonymous health exposes aggregate status.

## 1. Check liveness and traffic readiness

\`\`\`bash
curl -sS "$BISIBILITY_BASE/liveness"
curl -sS "$BISIBILITY_BASE/readiness"
\`\`\`

Inspect HTTP status as well as the response body. Liveness confirms the web
process responds. Readiness checks database reachability and blocking migration
readiness; 503 means this process is not ready for traffic. Network and TLS errors
require their own diagnosis and do not by themselves prove the process is down.

## 2. Inspect composite diagnostics

\`\`\`bash
curl -sS "$BISIBILITY_BASE/health" -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Read database/migration diagnostics, app/worker release and revision, worker
liveness, scheduler and Temporal/schema signals actually returned. Distinguish
\`unknown\`, \`disabled\`, stale and failed signals. Missing telemetry is not proof
of a failed worker; stale telemetry warrants investigation. Health can remain
available with only aggregate fields when the supplied credential is invalid or
credential storage is unavailable. An HTTP 200 alone does not verify authentication
or every subsystem.

## 3. Verify auth separately when needed

\`GET /capabilities\` is public feature/contract discovery. It ignores the bearer
credential and does not prove that the key works or reveal its scope. Read it only
when verifying enabled features, limits or an expected contract version.

Use authenticated \`GET /projects\` to verify visible project access when detailed
health was unavailable or the task requires project inventory. A 401/403 signals
a credential/access problem; an empty list alone does not establish instance-wide
health. A project key sees its scoped project; a personal token sees its accessible
projects. Paginate through \`meta.next_cursor\` for the agreed scope.

## 4. Inspect project wiring only for a project-specific symptom

Resolve \`$PROJECT_ID\` from project discovery, then read
\`GET /projects/{project_id}/providers\`. Inspect \`connection_status\`, \`enabled\`
and relevant \`capabilities\`, not just whether a catalog provider appears.
This saved configuration is not a live provider test. For repairs, hand off to
**provider-setup** rather than invoking its POST test from this read-only workflow.

## 5. Follow a known run only when investigating execution

A queued check request returns an \`rcr_...\` run ID. Use
\`GET /projects/{project_id}/rank-check-runs/{run_id}\`; read \`terminal\`,
\`polling_state\`, counts, timestamps and \`blocked_reason\`. Deferred or blocked work
is not automatically a broken worker. If the user supplies no known run, discover
a bounded recent set with \`GET /projects/{project_id}/rank-check-runs\` only when
needed for the diagnosis. Poll sparingly and stop after the agreed observation window.

Measurement IDs (\`check_...\`) are different. Read
\`GET /keywords/{id}/rank-checks?status=completed\` for actual saved measurements,
or \`GET /rank-checks/{check_id}\` for one known measurement. Never send a run ID to
the measurement endpoint. With a personal token, select the project using
\`X-Bisibility-Project\` on paths without a project ID when needed.

## Report the evidence and next step

Give observed liveness, readiness and diagnostic states; identify missing signals
and the first actionable failure. For example: web and database are ready, but
worker heartbeat is stale, so background execution is not confirmed. State the
specific investigation or repair to hand off, without changing the instance.

Use problem response detail, honor 429 retry windows, and avoid repeated probes
that cannot resolve the uncertainty. Healthy web endpoints do not independently
prove provider reachability or completed scheduled execution.`,
  references: [
    {
      path: "references/api.md",
      content: `# Self-host health - read-only contract

Base: resolved origin + \`/api/v1\`; read credential for detailed/project evidence.

| Operation | Evidence |
|-|-|
| GET /liveness | Web process response |
| GET /readiness | Database and blocking-migration readiness |
| GET /health | Aggregate anonymously; detailed diagnostics with valid auth |
| GET /capabilities | Public feature discovery, not credential validation |
| GET /projects | Authenticated accessible project inventory when needed |
| GET /projects/{project_id}/providers | Saved wiring, not a live provider probe |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Queued run state, rcr_... |
| GET /keywords/{id}/rank-checks?status=completed | Persisted measurements, check_... |
| GET /rank-checks/{check_id} | One known measurement, never an rcr_... run |

Only perform symptom-relevant follow-ups. Distinguish unknown, deferred, blocked,
failed and completed states. Never repair or start checks in this workflow.`,
    },
  ],
};
