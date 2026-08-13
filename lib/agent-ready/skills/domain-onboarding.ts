import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "domain-onboarding",
  title: "Domain onboarding",
  description:
    "Stand up rank tracking for a new domain end-to-end - create the project, set its defaults, connect a data provider, add the first keywords, and kick off an initial rank check. Use this when a user says they want to start tracking a new website/domain in bisibility.",
  compatibility: "Requires a bisibility origin and a bearer API key with write scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Domain onboarding

Onboard a brand-new domain into bisibility so it is fully ready for rank
tracking: create the project, configure its defaults (country, device), connect
a data provider, add the initial keyword set, and trigger a first rank check so
the user immediately has data flowing.

## When to use this skill

Use this when a user wants to **start tracking a new domain/website** from
scratch ("set up tracking for example.com", "onboard our new site"). If a
project already exists and the user only wants to add keywords, use the
**keyword-import** skill instead. For connecting or fixing a provider on an
existing project, use **provider-setup**.

## Prerequisites

- **Origin**: resolve the base URL first. EU hosted region is
  \`https://eu.bisibility.com/api/v1\`; a self-hosted instance is
  \`https://your-host.example/api/v1\`. Ask the user (or read it from config) and
  use it consistently as \`$BISIBILITY_BASE\`.
- **API key**: a bearer key with **write** scope, sent as
  \`Authorization: Bearer $BISIBILITY_API_KEY\`. Never print, echo, or log the
  key, and never write it into files.
- All list responses are \`{ "data": [...], "meta": { "next_cursor": "..." } }\`;
  paginate with \`?limit=<n>&cursor=<next_cursor>\`. Errors are
  \`application/problem+json\`; on 429, respect the retry window.

> Plan before you write. Confirm the domain, locale, and keyword list with the
> user before creating anything. Pass an \`Idempotency-Key\` header on each write
> so retries don't create duplicate projects, keywords, or checks.

## Steps

### 1. Create the project - \`POST /projects\` (createProject)

Create the project for the domain. Key fields: \`name\` and the canonical
\`domain\` to track.

\`\`\`bash
curl -sS -X POST "$BISIBILITY_BASE/projects" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: onboard-example-com-2026-06-29" \\
  -d '{
    "name": "Example Co",
    "domain": "example.com"
  }'
\`\`\`

Capture the returned project id and set \`PROJECT_ID\` to it - every following
call uses that variable.

### 2. Set project defaults - \`PATCH /projects/{project_id}/defaults\` (updateProjectDefaults)

Define the defaults new keywords inherit: country and device.

\`\`\`bash
curl -sS -X PATCH "$BISIBILITY_BASE/projects/$PROJECT_ID/defaults" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "country": "US",
    "device": "desktop"
  }'
\`\`\`

### 3. Connect a data provider (cross-reference: **provider-setup**)

A project needs a connected provider before rank checks can run. List available
providers with \`GET /projects/{project_id}/providers\` (listProviders), then
follow the **provider-setup** skill to \`connectProvider\` and
\`testProviderConnection\`. Provider credentials are bring-your-own and stored in
the instance - never echo them. Do not proceed to step 5 until the provider's
test passes.

### 4. Add the first keywords - \`POST /projects/{project_id}/keywords\` (addKeywords)

Submit the initial keyword set. Keywords inherit the project defaults from step
2; you can override per keyword (e.g. \`target_url\`, \`device\`) when needed.

\`\`\`bash
curl -sS -X POST "$BISIBILITY_BASE/projects/$PROJECT_ID/keywords" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: onboard-example-com-keywords-1" \\
  -d '{
    "keywords": [
      { "keyword": "best widgets" },
      { "keyword": "buy widgets online", "target_url": "https://example.com/shop" }
    ]
  }'
\`\`\`

The response \`data\` array contains the created keyword ids (\`kw_...\`).

### 5. Trigger an initial rank check - \`POST /keywords/{id}/checks\` (runRankCheck)

Kick off a first check per keyword so the user sees data right away (otherwise
they wait for the next scheduled run). Loop over the \`kw_...\` ids from step 4.

\`\`\`bash
curl -sS -X POST "$BISIBILITY_BASE/keywords/$KEYWORD_ID/checks" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: onboard-example-com-check-$KEYWORD_ID"
\`\`\`

Rank checks are asynchronous: the call enqueues work and returns quickly. Don't
block on results during onboarding - let the user know checks are running and
that ranks will appear once they complete.

## Notes / gotchas

- **Idempotency**: reuse a stable \`Idempotency-Key\` per logical action so a
  network retry never double-creates a project, keyword, or check.
- **Order matters**: defaults -> provider -> keywords -> checks. Adding keywords
  before defaults means they inherit whatever the project shipped with; adding
  checks before a working provider will fail.
- **Provider first for real data**: steps 4 and 5 succeed structurally without a
  provider, but checks can only resolve ranks once a provider is connected and
  tested.
- **Pagination & rate limits**: if you re-list keywords or providers to verify,
  follow \`meta.next_cursor\`; back off and retry on 429 per the retry window.
- **Secrets**: never print the API key or any provider credentials.`,
  references: [
    {
      path: "references/api.md",
      content: `# Domain onboarding - API cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\` (write scope).
Lists: \`{ data, meta.next_cursor }\`; paginate \`?limit&cursor\`. Errors:
\`application/problem+json\`. Writes accept \`Idempotency-Key\`.

| METHOD path | operationId | key fields |
|-|-|-|
| POST /projects | createProject | \`name\`, \`domain\` |
| PATCH /projects/{project_id}/defaults | updateProjectDefaults | \`country\`, \`device\` |
| POST /projects/{project_id}/keywords | addKeywords | \`keywords[].keyword\`, optional \`target_url\`/\`device\` |
| POST /keywords/{id}/checks | runRankCheck | (no body; enqueues async check) |

Connecting a provider is a prerequisite - see the **provider-setup** skill
(\`listProviders\`, \`connectProvider\`, \`testProviderConnection\`). Connect and
test a provider before running rank checks.

Recommended order: createProject -> updateProjectDefaults -> connect provider ->
addKeywords -> runRankCheck (per keyword id).`,
    },
  ],
};
