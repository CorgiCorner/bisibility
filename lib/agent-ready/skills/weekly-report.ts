import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "weekly-report",
  title: "Weekly rank-movement report",
  description:
    "Compile a week-over-week keyword rank-movement report for a bisibility project (top gainers, losers, and competitor context). Use this when an agent is asked to summarize how a site's rankings changed over the last 7 days.",
  compatibility: "Requires a bisibility origin and a bearer API key with read scope.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Weekly rank-movement report

Summarize saved ranking changes for an agreed project and reporting window.
This workflow only reads data. It never starts checks or changes settings.

## Prerequisites and bounds

Resolve \`$BISIBILITY_BASE\` including \`/api/v1\`, a read-scoped bearer credential
in \`$BISIBILITY_API_KEY\`, and \`$PROJECT_ID\` from \`GET /projects\`. Never display
the credential. With a personal token, pass \`X-Bisibility-Project: $PROJECT_ID\`
on paths without a project ID when the target would otherwise be ambiguous.

State the window and time zone, normally the last seven days in UTC. Confirm a
bounded keyword scope before reading a large project. Lists return \`data\` and
\`meta.next_cursor\`; follow pages within that scope and disclose any truncation.
Errors use \`application/problem+json\`; honor 429 retry windows.

## 1. Resolve the keyword scope

If the user names a saved segment, read
\`GET /projects/{project_id}/saved-views\` first and inspect its supported filters.
Otherwise read \`GET /projects/{project_id}/keywords\` directly. Keep each keyword's
public ID, text, canonical market and device. Do not combine different targets
just because their keyword text matches.

## 2. Read completed checks for one consistent window

For each scoped keyword, request \`status=completed\` and ISO date-time bounds
using \`since\` and \`until\` (not from/to):

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/keywords/$KEYWORD_ID/rank-checks?status=completed&since=2026-10-09T00:00:00Z&until=2026-10-16T00:00:00Z&limit=100" -H "Authorization: Bearer $BISIBILITY_API_KEY" -H "X-Bisibility-Project: $PROJECT_ID"
\`\`\`

Dates above are illustrative; calculate the requested window. Paginate each
keyword's history. Results are newest first. Read \`checked_at\`, \`position\`,
\`ranking_url\`, \`observation_completeness\`, public \`id\` (\`check_...\`) and available
run metadata. These list rows already contain ranking URLs; fetch
\`GET /rank-checks/{check_id}\` only if its detail is needed for a specific question.
Use IDs returned by this instance, not old CUID examples or run IDs.

## 3. Compare only supported observations

For a within-window movement summary, compare the earliest and latest suitable
checks in that window. Numeric delta is latest position minus earliest position;
a negative delta is an improvement. Label the actual observation dates. This is
not automatically a comparison against the previous calendar week: fetch the
prior window separately if that is what the user requested.

- A valid positive rank remains evidence even when observation coverage is truncated.
- Null position is not zero and is not automatically a loss. Only
  \`observation_completeness: "complete"\` supports absence within the applicable
  depth; unknown, missing or truncated coverage cannot establish a no-match.
- Report top-ten entries/exits only when both observations support the conclusion.
  Keep unknown coverage and changes of measurement scope out of numeric deltas.
- No completed checks means missing evidence. One suitable check means no
  within-window comparison. Report both cases rather than inventing movement.
- State denominator and comparable-keyword count when summarizing average change.

## 4. Add competitor context only when useful

\`GET /projects/{project_id}/competitors\` returns managed domains plus current
market observations and quality in \`meta.markets\`. Use it only when the user
requests competitor context or it explains a highlighted term. State its market,
measurement time and coverage. This current snapshot does not establish whether a
competitor gap widened or closed over the reporting week. That claim requires
separate comparable historical evidence; report the limitation if unavailable.

## 5. Deliver a concise report

Include window/time zone, scope, comparable-keyword count, main numeric gainers
and losers with old/new positions, dates and ranking URLs, supported top-ten
changes, and coverage or freshness gaps. Separate optional current competitor
context from historical changes. Give one evidence-backed next action.

Never trigger new checks to fill gaps, save a report unless separately requested,
or present a retained historical result as proof of current live rankings.`,
  references: [
    {
      path: "references/api.md",
      content: `# Weekly report - REST contract

Read scope; resolved origin + \`/api/v1\`. All operations are GETs.

| Operation | Purpose |
|-|-|
| GET /projects/{project_id}/saved-views | Only when a named segment needs resolving |
| GET /projects/{project_id}/keywords | Resolve bounded keyword identities |
| GET /keywords/{id}/rank-checks | status=completed, since, until, limit, cursor |
| GET /rank-checks/{check_id} | Optional specific detail; check_... public ID |
| GET /projects/{project_id}/competitors | Optional current meta.markets context, not a weekly time series |

Lists paginate with meta.next_cursor. Personal tokens may need the
X-Bisibility-Project header on projectless paths. Results include ranking_url and
observation_completeness. Only complete coverage supports absence within depth;
null/unknown/truncated is not a numeric loss. Compare suitable observations with
stated dates, market, device and coverage; disclose missing baselines.`,
    },
  ],
};
