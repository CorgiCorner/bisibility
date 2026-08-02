import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "alert-triage",
  title: "Alert triage",
  description:
    "Investigate bisibility ranking alerts that have fired and tune the rules that produce them; use this when a project's alerts are noisy, a sudden drop needs root-causing, or you need to confirm an alert reflects a real rank movement.",
  compatibility:
    "Requires a bisibility origin and a bearer API key with write scope (reading alerts/checks works with read; creating or editing alert rules needs write).",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Alert triage

Triage the ranking alerts that have fired for a bisibility project: confirm each
one against the underlying rank-check data, separate signal from noise, and then
adjust the alert rules so future alerts are trustworthy.

## When to use this skill

Use it when a project is sending too many (or too few) alerts, when a keyword
appears to have dropped or jumped and you need to verify it, or when you are
asked to "look at the alerts" and decide which ones are real and what to change.

## Prerequisites

- A bisibility **origin / base URL**. EU Cloud is \`https://eu.bisibility.com/api/v1\`;
  self-hosted is \`https://your-host.example/api/v1\`. Resolve which one applies
  before making calls and reuse it everywhere below.
- A **bearer API key**. Reading triggered alerts and rank checks needs \`read\`;
  creating or editing alert rules needs \`write\`.
- Put the key in an env var and send it as \`Authorization: Bearer $BISIBILITY_API_KEY\`.
  **Never print, log, or echo the key.**
- You need the \`project_id\` (\`prj_...\`); list projects first if you do not have it.

\`\`\`bash
BASE="https://eu.bisibility.com/api/v1"   # or https://your-host.example/api/v1
AUTH="Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

## Steps

### 1. List what has actually fired - \`GET /projects/{project_id}/triggered-alerts\` (listTriggeredAlerts)

Start from the alerts that fired; do not guess from rules.

\`\`\`bash
curl -s -H "$AUTH" \\
  "$BASE/projects/$PROJECT_ID/triggered-alerts?limit=50"
\`\`\`

The response is \`{ "data": [...], "meta": { "next_cursor": "..." } }\`. Each item
references the rule that fired, the keyword, and the rank-check that triggered it.
Paginate with \`?limit=<n>&cursor=<next_cursor>\` until \`next_cursor\` is null.
Filter to a recent window where supported (e.g. \`?since=<ISO-8601>\`).

### 2. Verify each alert against the real check - \`GET /rank-checks/{check_id}\` (getRankCheckResult)

For every alert worth investigating, fetch the exact rank-check it fired on and
confirm the recorded position, target URL, and search engine/locale.

\`\`\`bash
curl -s -H "$AUTH" "$BASE/rank-checks/$CHECK_ID"
\`\`\`

A "drop" caused by a one-off SERP glitch, a CAPTCHA, or a missing result is not
the same as a sustained ranking loss - distinguish them here.

### 3. See the trend, not the point - \`GET /keywords/{id}/rank-checks\` (listRankChecks)

Pull the recent history for the keyword to decide whether the alert reflects a
real trend or normal volatility.

\`\`\`bash
curl -s -H "$AUTH" \\
  "$BASE/keywords/$KEYWORD_ID/rank-checks?limit=30"
\`\`\`

Compare the last several positions. A single outlier amid a stable series is
noise; a consistent downward slope is a real movement worth keeping.

### 4. Review the rules behind the noise - \`GET /projects/{project_id}/alert-rules\` (listAlertRules)

Inspect the configured rules to find which thresholds are producing the alerts
you just triaged.

\`\`\`bash
curl -s -H "$AUTH" "$BASE/projects/$PROJECT_ID/alert-rules?limit=50"
\`\`\`

### 5a. Tighten an existing rule - \`PATCH /alert-rules/{rule_id}\` (updateAlertRule)

If a rule is too sensitive (firing on small wiggles), raise its threshold or
widen its window. Use an \`Idempotency-Key\` so a retried write applies once.

\`\`\`bash
curl -s -X PATCH -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: triage-$(date +%s)" \\
  -d '{"threshold": 5, "direction": "drop", "enabled": true}' \\
  "$BASE/alert-rules/$RULE_ID"
\`\`\`

### 5b. Add a missing rule - \`POST /projects/{project_id}/alert-rules\` (createAlertRule)

If triage shows a gap (e.g. a top keyword has no drop alert), create a rule.

\`\`\`bash
curl -s -X POST -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: rule-$(date +%s)" \\
  -d "$(printf '{"keyword_id":"%s","metric":"position","direction":"drop","threshold":3,"enabled":true}' "$KEYWORD_ID")" \\
  "$BASE/projects/$PROJECT_ID/alert-rules"
\`\`\`

## Notes and gotchas

- **Plan before any write.** Steps 1-4 are read-only investigation. Only edit or
  create rules (5a/5b) after you have confirmed the alerts are noisy or missing.
- **Confirm the field names** for a rule body (\`metric\`, \`direction\`,
  \`threshold\`, \`window\`) against \`GET /api/v1/openapi.json\` for the resolved
  origin before writing - exact shapes can vary by version.
- **Errors** use \`application/problem+json\`; read the \`detail\` field. On \`429\`
  honor the retry window in the response before retrying.
- **One outlier is not a trend** - always corroborate a triggered alert with the
  keyword's rank-check history (step 3) before changing a rule.
- **Never echo provider credentials or the API key.** Provider creds are
  bring-your-own and stored in the instance.`,
  references: [
    {
      path: "references/api.md",
      content: `# Alert triage - endpoint cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\`.
Lists return \`{ "data": [...], "meta": { "next_cursor": "..." } }\`; paginate with
\`?limit=<n>&cursor=<next_cursor>\`. Writes accept an optional \`Idempotency-Key\`.
Errors use \`application/problem+json\`; \`429\` includes a retry window.

| METHOD path | operationId | key fields |
|-|-|-|
| GET /projects/{project_id}/triggered-alerts | listTriggeredAlerts | \`limit\`, \`cursor\`, \`since\` |
| GET /projects/{project_id}/alert-rules | listAlertRules | \`limit\`, \`cursor\` |
| POST /projects/{project_id}/alert-rules | createAlertRule | \`keyword_id\`, \`metric\`, \`direction\`, \`threshold\` |
| PATCH /alert-rules/{rule_id} | updateAlertRule | \`threshold\`, \`direction\`, \`enabled\` |
| GET /keywords/{id}/rank-checks | listRankChecks | \`limit\`, \`cursor\` |
| GET /rank-checks/{check_id} | getRankCheckResult | path: \`check_id\` |

Scopes: reads need \`read\`; createAlertRule / updateAlertRule need \`write\`.
IDs: project \`prj_...\`, keyword \`kw_...\`, API key \`bsb_key_live_...\`.`,
    },
  ],
};
