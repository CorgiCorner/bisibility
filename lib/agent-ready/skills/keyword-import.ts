import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "keyword-import",
  title: "Keyword import",
  description:
    "Bulk-import and update tracked keywords for a Bisibility project, set target URLs, and kick off rank checks. Use when an agent needs to seed or reconcile a keyword set from a list, spreadsheet, or competitor research.",
  compatibility: "Requires a Bisibility origin and a bearer API key with write scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Keyword import

Import a batch of keywords into a Bisibility project, attach the target URL each
keyword should rank, optionally update existing rows in bulk, and trigger rank
checks. Use this skill when you have a list of keywords (from a brief, CSV,
competitor scan, or a search-console export) and need them tracked under one
project.

## When to use

- Seeding a new or existing project with many keywords at once.
- Reconciling a project's keyword set against an external source of truth
  (add missing, retag, repoint target URLs).
- Forcing fresh rank checks right after an import instead of waiting for the
  next scheduled run.

If you still need to create the project or connect a search-data provider first,
do that via the **domain-onboarding** and **provider-setup** skills, then return
here.

## Prerequisites

1. **Origin / base URL.** EU Cloud: \`https://eu.bisibility.com/api/v1\`. Self-hosted:
   \`https://your-host.example/api/v1\`. Resolve the correct base URL before any
   call (ask the user or read it from config).
2. **API key with \`write\` scope.** Put it in an env var and send it as
   \`Authorization: Bearer $BISIBILITY_API_KEY\`. Never print, echo, or log the
   key, and never paste it into a file.
3. **A project id** (\`prj_...\`). List projects (\`GET /projects\`) if you do not
   have it.

\`\`\`bash
export BISIBILITY_API_KEY=placeholder
export BASE="https://eu.bisibility.com/api/v1"
export PROJECT="\${BISIBILITY_PROJECT_ID:?set a project id returned by GET /projects}"
\`\`\`

## Steps

### 1. Inspect the existing keyword set - \`GET /projects/{project_id}/keywords\` (listKeywords)

Avoid duplicates: pull what is already tracked before importing. Paginate with
\`?limit=<n>&cursor=<next_cursor>\` until \`meta.next_cursor\` is null.

\`\`\`bash
curl -s "$BASE/projects/$PROJECT/keywords?limit=100" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Compare the returned \`data[].keyword\` values against your import list and only
add the genuinely new ones.

### 2. Add the new keywords - \`POST /projects/{project_id}/keywords\` (addKeywords)

Send a batch. Each item carries the keyword plus optional targeting metadata
(\`target_url\`, \`location\`, \`device\`, \`tags\`). Pass an \`Idempotency-Key\` so a
retried request does not create duplicate rows.

\`\`\`bash
curl -s -X POST "$BASE/projects/$PROJECT/keywords" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: import-2026-06-29-batch-1" \\
  -d '{
    "keywords": [
      { "keyword": "best running shoes", "target_url": "https://example.com/shoes", "location": "US", "device": "desktop", "tags": ["footwear"] },
      { "keyword": "trail running shoes", "location": "US", "device": "mobile" }
    ]
  }'
\`\`\`

The response returns the created rows with their \`kw_...\` ids - keep them for the
next steps.

### 3. Bulk-update existing rows - \`POST /keywords/bulk\` (bulkUpdateKeywords)

When reconciling, use one bulk call to retag or repoint many existing keywords
instead of one PATCH per row. Reference rows by their \`kw_...\` ids.

\`\`\`bash
curl -s -X POST "$BASE/keywords/bulk" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "updates": [
      { "id": "kw_a00000000000000000000000", "tags": ["footwear", "priority"] },
      { "id": "kw_b00000000000000000000000", "target_url": "https://example.com/trail" }
    ]
  }'
\`\`\`

### 4. Fix a single keyword's target URL - \`PATCH /keywords/{id}\` (setKeywordTargetUrl)

For a one-off correction (a keyword pointing at the wrong landing page), patch
just that row.

\`\`\`bash
curl -s -X PATCH "$BASE/keywords/kw_b00000000000000000000000" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "target_url": "https://example.com/trail-running" }'
\`\`\`

### 5. Trigger rank checks - \`POST /keywords/{id}/checks\` (runRankCheck)

Optionally force a fresh check per keyword right after import. This is an
on-demand check that runs against the project's connected provider; the
response typically references a job you can follow up on.

\`\`\`bash
curl -s -X POST "$BASE/keywords/kw_a00000000000000000000000/checks" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Loop over the new \`kw_...\` ids to enqueue checks. Do not hammer the endpoint -
space them out and respect rate limits (see notes).

## Notes / gotchas

- **Dedupe first.** \`addKeywords\` may reject or silently merge a keyword that
  already exists for the same location/device. Step 1 keeps the import clean.
- **Idempotency.** Always send an \`Idempotency-Key\` on \`addKeywords\` and other
  writes so a network retry does not double-import. Reuse the same key value for
  the same logical batch.
- **Batch size.** For very large lists, chunk \`addKeywords\` (e.g. 100-500 per
  call) and paginate \`listKeywords\` rather than requesting everything at once.
- **Rate limits.** A 429 returns \`application/problem+json\` with a retry window;
  back off for that window before retrying. Stagger the step-5 rank checks.
- **Provider required for checks.** \`runRankCheck\` needs a connected search-data
  provider on the project. If checks fail with a provider error, run the
  provider-setup skill, then retry.
- **Credentials.** Provider credentials are bring-your-own and stored in the
  instance - never request, echo, or store them here.
- **Errors.** All errors are \`application/problem+json\`; read \`title\` and
  \`detail\` and fix the request rather than blind-retrying non-429s.`,
  references: [
    {
      path: "references/api.md",
      content: `# Keyword import - endpoint cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\` (write scope).
Lists return \`{ data: [...], meta: { next_cursor } }\`; paginate with
\`?limit=<n>&cursor=<next_cursor>\`. Writes accept an \`Idempotency-Key\` header.
Errors are \`application/problem+json\`; 429 carries a retry window.

| METHOD path | operationId | key fields |
|-|-|-|
| GET /projects/{project_id}/keywords | listKeywords | query: limit, cursor, tag |
| POST /projects/{project_id}/keywords | addKeywords | body: keywords[] (keyword, target_url, location, device, tags) |
| POST /keywords/bulk | bulkUpdateKeywords | body: updates[] (id, target_url, tags) |
| PATCH /keywords/{id} | setKeywordTargetUrl | body: target_url |
| POST /keywords/{id}/checks | runRankCheck | path: id; returns a job reference |

Id shapes: project \`prj_...\`, keyword \`kw_...\`, API key \`bsb_key_live_...\`.`,
    },
  ],
};
