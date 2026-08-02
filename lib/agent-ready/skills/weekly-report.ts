import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "weekly-report",
  title: "Weekly rank-movement report",
  description:
    "Compile a week-over-week keyword rank-movement report for a bisibility project (top gainers, losers, and competitor context). Use this when an agent is asked to summarize how a site's rankings changed over the last 7 days.",
  compatibility: "Requires a bisibility origin and a bearer API key with read scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Weekly rank-movement report

Build a read-only, week-over-week summary of how a project's keywords moved in
Google rankings: biggest gainers, biggest losers, keywords that entered or fell
out of the top results, and how tracked competitors compare.

**When to use this skill:** an agent is asked to "summarize this week's ranking
changes", produce a weekly SEO digest, or explain which keywords improved or
regressed for a bisibility project. This skill only reads data - it never starts
checks or changes settings.

## Prerequisites

1. **Origin (base URL).** Resolve it before doing anything:
   - EU Cloud: \`https://eu.bisibility.com/api/v1\`
   - Self-hosted: \`https://your-host.example/api/v1\`
   Prefer an explicit \`BISIBILITY_BASE_URL\`; otherwise ask the user which origin
   they use. All paths below are relative to this base.
2. **API key with \`read\` scope.** Sent as \`Authorization: Bearer $BISIBILITY_API_KEY\`.
   Never print, echo, or log the key. Keep it in an env var only.
3. **A project id** (\`prj_...\`). If unknown, list projects via the router skill's
   \`GET /projects\` and confirm with the user.
4. **A reporting window.** Default to the last 7 days. Compute an ISO start/end
   (e.g. \`from\` = now - 7d) and reuse it for every keyword.

\`\`\`bash
: "\${BISIBILITY_BASE_URL:?set the origin, e.g. https://eu.bisibility.com/api/v1}"
: "\${BISIBILITY_API_KEY:?set the read-scope API key}"
PROJECT="\${BISIBILITY_PROJECT_ID:?set the project id returned by GET /projects}"
\`\`\`

## Steps

### 1. List the project's keywords - \`GET /projects/{project_id}/keywords\` (listKeywords)

Enumerate every tracked keyword so you know what to report on. Paginate with
\`?limit=&cursor=\` until \`meta.next_cursor\` is null.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/projects/$PROJECT/keywords?limit=100" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
# -> { "data": [ { "id": "kw_...", "keyword": "...", "target_url": "..." }, ... ],
#      "meta": { "next_cursor": null } }
\`\`\`

Collect each \`kw_...\` id. For large projects, consider scoping to a saved view
(step 4) instead of every keyword.

### 2. Get each keyword's rank history for the window - \`GET /keywords/{id}/rank-checks\` (listRankChecks)

For every keyword id, pull the rank checks inside your reporting window. Use the
list params to bound the range and paginate as needed.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/keywords/$KEYWORD_ID/rank-checks?limit=50&from=2026-06-22&to=2026-06-29" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
# -> { "data": [ { "id": "cm5xam3k20001js0cg1qw9rle", "position": 7, "checked_at": "2026-06-29T..." }, ... ] }
\`\`\`

For each keyword compute the **delta**: \`position\` of the latest check in the
window minus the earliest. Lower position = better, so a negative delta is an
improvement. Flag entries/exits (e.g. crossed into or out of the top 10) and
keywords with no checks in the window (stale - note them, do not invent data).

### 3. Pull full detail only for notable movers - \`GET /rank-checks/{check_id}\` (getRankCheckResult)

For the top gainers/losers, fetch the latest check by id to enrich the report
with the actual ranking URL and SERP context. Do this only for the handful you
will highlight - not every check.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/rank-checks/cm5xam3k20001js0cg1qw9rle" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
# -> { "id": "cm5xam3k20001js0cg1qw9rle", "position": 4, "url": "https://...", "checked_at": "..." }
\`\`\`

### 4. (Optional) Scope to a saved view - \`GET /projects/{project_id}/saved-views\` (listSavedViews)

If the user wants a specific segment ("brand terms", "blog"), list saved views
and use the matching view's keyword filter to narrow step 1 instead of reporting
on the whole project.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/projects/$PROJECT/saved-views" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 5. Add competitor context - \`GET /projects/{project_id}/competitors\` (listCompetitors)

List tracked competitors so the report can note their rankings for the same terms
and whether the gap widened or closed over the week.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/projects/$PROJECT/competitors" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 6. Assemble the report

Produce a concise digest:
- **Summary:** keywords tracked, average position change, # improved vs declined.
- **Top gainers** and **top losers** (keyword, old -> new position, delta, URL).
- **Entered / dropped out of top 10.**
- **Competitor notes** for the highlighted terms.
- **Data gaps:** keywords with no checks in the window.

## Notes / gotchas

- **Read-only.** This skill never calls \`runRankCheck\` or any write endpoint. If
  data is missing for the window, report the gap rather than triggering checks.
- **Position semantics:** lower is better; treat "not found / null" as worse than
  any numeric position and label it explicitly, never as 0.
- **Pagination:** always follow \`meta.next_cursor\` so you don't truncate the
  keyword set or rank history.
- **Rate limits:** a 429 is \`application/problem+json\` with a retry window -
  honor it and back off; batch keyword lookups gently.
- **Time zones:** compute the window in a single, stated time zone (UTC is
  safest) and keep \`from\`/\`to\` consistent across all keywords.
- **Never print the API key** in commands, logs, or the final report.`,
  references: [
    {
      path: "references/api.md",
      content: `# Weekly report - endpoint cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\` (scope: \`read\`).
Lists return \`{ "data": [...], "meta": { "next_cursor": "..." } }\`; paginate
with \`?limit=<n>&cursor=<next_cursor>\`. Errors are \`application/problem+json\`;
429 carries a retry window. This skill is read-only.

| METHOD path | operationId | key params / fields |
|-|-|-|
| GET /projects/{project_id}/keywords | listKeywords | path: project_id; query: limit, cursor -> data[].id (kw_...), keyword, target_url |
| GET /keywords/{id}/rank-checks | listRankChecks | path: id (kw_...); query: limit, cursor, from, to -> data[].id (cuid), position, checked_at |
| GET /rank-checks/{check_id} | getRankCheckResult | path: check_id (cuid) -> position, url, checked_at |
| GET /projects/{project_id}/competitors | listCompetitors | path: project_id -> data[].domain, label |
| GET /projects/{project_id}/saved-views | listSavedViews | path: project_id -> data[].id, name, keyword filter |

## Delta convention
position delta = latest.position - earliest.position within the window.
Negative = improved (lower rank number is better). Null/"not found" = worse than
any numeric position; report explicitly, never as 0.
`,
    },
  ],
};
