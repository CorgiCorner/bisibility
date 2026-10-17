import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "keyword-import",
  title: "Keyword import",
  description:
    "Reconcile a supplied keyword list with tracked identities, add missing keywords and apply requested metadata changes. Fresh paid checks require separate explicit approval. Use for importing or updating a project's keyword set.",
  compatibility: "Requires a bisibility origin and a bearer API key with write scope.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Keyword import

Reconcile an agreed list with tracked keywords, add missing identities and apply
only requested metadata corrections. Finish with verified created/skipped/updated
counts. Fresh rank checks require separate explicit spending approval.

## Prerequisites

Resolve \`$BISIBILITY_BASE\` including \`/api/v1\`, \`$PROJECT_ID\` from \`GET /projects\`,
and a write-scoped bearer credential in \`$BISIBILITY_API_KEY\`. Never display the
credential. With a personal token, select this project using
\`X-Bisibility-Project: $PROJECT_ID\` on paths without a project ID.

Confirm the input list, canonical markets, devices, target URLs and intended
changes before writes. Reuse a stable \`Idempotency-Key\` per logical action on
retries. Lists paginate with \`meta.next_cursor\`; honor 429 retry windows.

## 1. Compare against existing keyword identities

Read \`GET /projects/{project_id}/keywords\` and follow every page in the agreed
scope. Compare keyword text together with canonical location and device; the same
text in a different market or device is a distinct identity. For omitted market or
device values, read project defaults to resolve what the proposed rows inherit.

Separate new rows, already tracked identities and requested metadata changes.
Do not silently rewrite keyword text, location or device on an existing identity;
these identity changes require a new target, not a metadata PATCH.

Confirm scheduling as part of the exact keyword plan. The examples below use
manual schedules with no cron. Omitting a schedule can inherit recurring project
defaults; do not do so without showing and approving that effect. Enabling or
expanding recurring paid checks requires its own cost-aware approval.

## 2. Add missing rows

For a confirmed batch (maximum 500 items):

\`\`\`bash
curl -fsS -X POST "$BISIBILITY_BASE/projects/$PROJECT_ID/keywords" -H "Authorization: Bearer $BISIBILITY_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: import-running-shoes-batch-1" -d '{"keywords":[{"keyword":"best running shoes","target_url":"https://example.com/shoes","location_key":"US","device":"desktop","tags":["footwear"],"schedule":{"frequency":"manual","cron_expression":null,"timezone":"UTC","jitter_minutes":60}},{"keyword":"trail running shoes","location_key":"US","device":"mobile","schedule":{"frequency":"manual","cron_expression":null,"timezone":"UTC","jitter_minutes":60}}]}'
\`\`\`

Read \`data.created\`, \`data.skipped\` and \`data.results[]\`. Each result contains
\`status\` (\`created\` or \`skipped\`) and \`keyword.id\` (\`kw_...\`). Existing identities
are skipped; this is not a promise that their metadata was reconciled.

## 3. Correct metadata only where the input requires it

For one row, \`PATCH /keywords/{id}\` accepts \`target_url\`, tags and other supported
metadata. For a shared change across rows, \`POST /keywords/bulk\` requires
\`keyword_ids\` and one \`operation\`, not an \`updates\` array. Examples:

\`\`\`json
{"keyword_ids":["kw_a00000000000000000000000"],"operation":"add_tags","tags":["footwear","priority"]}
\`\`\`

\`\`\`json
{"keyword_ids":["kw_b00000000000000000000000"],"operation":"set_target_url","target_url":"https://example.com/trail-running"}
\`\`\`

Use separate calls for different operations or values. Inspect
\`data.results[].status\`, including \`not_found\`, rather than claiming every
requested row changed. Do not bulk update rows that already match the input.

## 4. Read back and summarize

Read the affected keyword rows and verify canonical location, device, target URLs
and tags. Report input count, already tracked identities, created/skipped rows,
applied corrections and any unresolved rows. Report no fresh ranking data unless
a separately approved check completed.

## 5. Optional checks only with explicit spending approval

For a requested bounded set with a suitable connected provider, review cost and
obtain explicit approval before \`POST /keywords/{id}/checks\`. Include the agreed
\`max_cost_cents\` and stable idempotency key; do not auto-check the whole project.
A queued 202 returns a run ID (\`rcr_...\`) in \`data.id\`. Follow
\`GET /projects/{project_id}/rank-check-runs/{run_id}\`; inspect terminal state,
counts and blocked reason. Read completed measurements through
\`GET /keywords/{id}/rank-checks?status=completed\` when available. A queued run is
not a completed ranking result. An inline 201 may return the measurement directly.

Never expose bearer or provider credentials. Use **provider-setup** if connection
repair is needed, and report missing evidence rather than inventing ranks.`,
  references: [
    {
      path: "references/api.md",
      content: `# Keyword import - REST contract

Base: resolved origin + \`/api/v1\`; write scope and project permissions.
Personal-token paths without a project ID use X-Bisibility-Project when ambiguous.

| Operation | Contract |
|-|-|
| GET /projects/{project_id}/keywords | Paginate; compare text + canonical location + device |
| GET /projects/{project_id}/defaults | Resolve omitted market/device |
| POST /projects/{project_id}/keywords | keywords[]; at most 500; data.created/skipped/results[].keyword |
| POST /keywords/bulk | keyword_ids[] + operation + its shared fields; no updates[] |
| PATCH /keywords/{id} | Requested metadata correction; keyword identity is immutable |
| POST /keywords/{id}/checks | Explicitly approved paid check, max_cost_cents |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Poll queued rcr_... run |
| GET /keywords/{id}/rank-checks?status=completed | Read saved check_... measurements |

Bulk operations include add_tags, remove_tags, set_target_url, set_frequency and
delete; deletion requires the appropriate role and is not routine import cleanup.
Check created/skipped and per-ID status; read back the final rows. No automatic checks.`,
    },
  ],
};
