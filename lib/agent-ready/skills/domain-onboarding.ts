import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "domain-onboarding",
  title: "Domain onboarding",
  description:
    "Set up a new domain project with reviewed defaults, an intended provider and first keywords. Request initial paid checks only with explicit spending approval. Use when a user wants to start tracking a new website in bisibility.",
  compatibility:
    "Requires a resolved bisibility origin and a write-scoped personal access token for project creation; a project API key cannot create projects.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Domain onboarding

Create a domain project, confirm its tracking defaults, connect the intended
provider and add an agreed first keyword set. Initial paid checks are a separate,
explicitly approved step; creating a project is not proof that rankings exist.

## Prerequisites and scope

- Resolve the instance origin; use \`$BISIBILITY_BASE\` including \`/api/v1\`.
- Project creation requires a personal access token (\`bsb_pat_live_...\`) with
  write scope. A project API key (\`bsb_key_live_...\`) cannot create projects.
  Send the token as \`Authorization: Bearer $BISIBILITY_API_KEY\`; never display it.
- Confirm the domain, name, market, device and initial keyword list before writes.
  Read existing projects first; reuse the right project rather than duplicating it.
- Use stable \`Idempotency-Key\` values for retriable writes. Lists paginate through
  \`meta.next_cursor\`; errors use \`application/problem+json\`. Honor 429 retry windows.

## 1. Find or create the project

\`GET /projects\` lists projects visible to the personal token. If the requested
project already exists, use **keyword-import** or **provider-setup** instead.
Otherwise create the confirmed project:

\`\`\`bash
curl -fsS -X POST "$BISIBILITY_BASE/projects" -H "Authorization: Bearer $BISIBILITY_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: onboard-example-com-project" -d '{"name":"Example Co","domain":"example.com"}'
\`\`\`

Capture \`data.id\` (\`prj_...\`) as \`$PROJECT_ID\`. Project paths select it directly.
For later paths without a project ID, pass \`X-Bisibility-Project: $PROJECT_ID\`
when using a personal token.

## 2. Preview and confirm defaults

First read \`GET /capabilities\` and verify
\`features.reviewed_project_defaults=v1\`. Preview the exact intended patch:

\`\`\`bash
curl -fsS -X PATCH "$BISIBILITY_BASE/projects/$PROJECT_ID/defaults?preview_only=true" -H "Authorization: Bearer $BISIBILITY_API_KEY" -H "Content-Type: application/json" -d '{"location_key":"US","device":"desktop"}'
\`\`\`

This preview performs no writes or provider calls. Show the resolved market,
cadence, depth and impact to the user. After confirmation, send the same patch
to \`PATCH /projects/{project_id}/defaults\` with a \`review\` object containing
\`expected_source_hash\`, \`expected_revision\` and \`preview_token\` copied exactly
from \`data\`, a stable \`idempotency_key\` (8-128 characters), and \`confirmed: true\`.
The header alone does not replace this review object.

A missing review returns 428. A changed or expired preview returns 409; obtain a
fresh preview and confirmation rather than reusing stale values. Saving defaults
does not retarget existing keyword identities or rewrite their history.

## 3. Verify the intended provider

Read \`GET /projects/{project_id}/providers\`. Reuse the enabled, connected provider
that supports rank checks. If credentials need connecting, follow **provider-setup**.
Connect verifies credentials before saving; a second test is unnecessary after a
successful connect. Never display provider credentials.

Confirm scheduling as part of the exact keyword plan. The examples below use
manual schedules with no cron. Omitting a schedule can inherit recurring project
defaults; do not do so without showing and approving that effect. Enabling or
expanding recurring paid checks requires its own cost-aware approval.

## 4. Add the agreed first keywords

Read existing keywords before adding and compare keyword text, canonical market
and device. Submit only the missing identities:

\`\`\`bash
curl -fsS -X POST "$BISIBILITY_BASE/projects/$PROJECT_ID/keywords" -H "Authorization: Bearer $BISIBILITY_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: onboard-example-com-keywords-1" -d '{"keywords":[{"keyword":"best widgets","location_key":"US","device":"desktop","schedule":{"frequency":"manual","cron_expression":null,"timezone":"UTC","jitter_minutes":60}},{"keyword":"buy widgets online","target_url":"https://example.com/shop","location_key":"US","device":"desktop","schedule":{"frequency":"manual","cron_expression":null,"timezone":"UTC","jitter_minutes":60}}]}'
\`\`\`

The response is \`data.created\`, \`data.skipped\` and \`data.results[]\` with
\`status\` and \`keyword.id\` (\`kw_...\`). Read back the keywords to verify the saved
market, device and target URLs. Adding keywords does not establish fresh rank data.

## 5. Request initial checks only when approved

If the user requested paid checks, review their bounded scope and provider cost,
obtain explicit spending approval, and supply the agreed \`max_cost_cents\` to
\`POST /keywords/{id}/checks\`. Do not automatically loop over every keyword.
Send the project-selection header on this path when using a personal token.

A 202 returns \`data.id\` as a run ID (\`rcr_...\`), not a measurement ID. Follow
\`GET /projects/{project_id}/rank-check-runs/{run_id}\` and report \`terminal\`,
\`polling_state\`, counts and \`blocked_reason\`. After execution, read completed
results from \`GET /keywords/{id}/rank-checks?status=completed\`. An inline 201 may
return the measurement directly. Never claim that queued work already produced ranks.

## Report the result

State the project, confirmed defaults, provider readiness, created/skipped keyword
counts and readback. Distinguish checks not requested, queued, blocked, failed and
completed. If paid checks were not approved, finish with setup verified and that
remaining step clearly stated.`,
  references: [
    {
      path: "references/api.md",
      content: `# Domain onboarding - REST contract

Base: resolved origin + \`/api/v1\`. Creation needs a write-scoped personal token;
project keys cannot create projects. Personal-token projectless paths need
\`X-Bisibility-Project\` when the project is ambiguous.

| Operation | Purpose |
|-|-|
| GET /projects | Find an existing project first |
| POST /projects | Create with name and domain; read data.id |
| PATCH /projects/{project_id}/defaults?preview_only=true | Preview intended defaults |
| PATCH /projects/{project_id}/defaults | Same patch plus exact confirmed review |
| GET /projects/{project_id}/providers | Reuse or connect the intended provider |
| POST /projects/{project_id}/keywords | Read data.created/skipped/results[].keyword.id |
| POST /keywords/{id}/checks | Approved paid check; optional max_cost_cents |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Poll queued run, rcr_... |
| GET /keywords/{id}/rank-checks?status=completed | Read measurements, check_... |

Defaults review requires expected_source_hash, expected_revision, preview_token,
idempotency_key and confirmed=true. Missing review: 428; stale preview: 409.
Never expose bearer/provider credentials or treat queue acceptance as completion.`,
    },
  ],
};
