import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "bisibility",
  title: "Bisibility (router)",
  description:
    "Orient on a Bisibility instance and route to the right task skill; use this first whenever an agent is asked to do anything with Bisibility rank tracking and is not yet sure which task or endpoint applies.",
  compatibility:
    "Requires a Bisibility origin and a bearer API key with read scope (individual tasks may need write or admin).",
  kind: "task-router",
  version: "0.1.0",
  body: `# Bisibility (router)

Bisibility is a search-rank-tracking platform: you organize **projects** (a domain
plus its defaults), connect a bring-your-own search-data **provider**, track
**keywords**, run **rank checks**, and fire **alerts** on rank movement. This is
the **router** skill - it does not perform a task. Use it to orient yourself on an
instance, resolve credentials, and pick the specific task skill that does the work.

## When to use this skill

Start here whenever you are asked to do something with Bisibility but are not yet
sure which task or endpoint applies. Once you know the goal, hand off to the
matching task skill (listed below) and follow that skill's steps.

## Prerequisites

1. **Origin / base URL.** Either the EU Cloud instance
   \`https://eu.bisibility.com/api/v1\` or a self-hosted instance
   \`https://your-host.example/api/v1\`. Resolve which one you are targeting from the
   user or environment before making any call; do not assume hosted.
2. **API key.** A bearer key (\`bsb_key_live_...\`). Pass it as
   \`Authorization: Bearer $BISIBILITY_API_KEY\`. **Never print, echo, or log the
   key**, and never echo provider credentials.
3. **Scope.** Keys carry \`read\`, \`write\`, or \`admin\`. Reading needs \`read\`;
   provider/keyword/alert writes need \`write\`; API-key, team, and migration-token
   ops need \`admin\`. Confirm your key's scope covers the task before you begin.

## Discovery URLs (machine-readable orientation)

Fetch these to learn what a given instance supports before routing:

- \`/llms.txt\` - human/agent-readable overview of the instance.
- \`/api/v1/openapi.json\` - full OpenAPI spec (authoritative endpoint list).
- \`/api/v1/capabilities\` - enabled features, limits, provider support.
- \`/.well-known/agent-skills/index.json\` - the published task-skill catalog.
- \`/.well-known/mcp/server-card.json\` - MCP server card, if MCP is enabled.

## Orientation calls

\`\`\`bash
# Liveness (getLiveness) - no auth needed on most instances
curl -s https://eu.bisibility.com/api/v1/liveness

# Traffic readiness (getReadiness)
curl -s https://eu.bisibility.com/api/v1/readiness

# What this instance can do (getCapabilities)
curl -s https://eu.bisibility.com/api/v1/capabilities \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"

# Find the project you will work in (listProjects)
curl -s "https://eu.bisibility.com/api/v1/projects?limit=20" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

List endpoints return \`{ "data": [...], "meta": { "next_cursor": "..." } }\`;
paginate with \`?limit=<n>&cursor=<next_cursor>\`. Errors are
\`application/problem+json\`; on \`429\` honor the retry window in the response.

## Routing table - pick the task skill

| Goal | Skill | Scope |
|-|-|-|
| Connect / test / configure a search-data provider | \`provider-setup\` | write |
| Stand up a new domain end to end | \`domain-onboarding\` | write |
| Add or bulk-update tracked keywords | \`keyword-import\` | write |
| Investigate triggered alerts, tune alert rules | \`alert-triage\` | write |
| Build a weekly rank-movement report | \`weekly-report\` | read |
| Verify a self-hosted instance is healthy | \`self-host-health\` | read |
| Manage API keys, team invites, migration tokens | \`team-api-governance\` | admin |

If the goal spans several (e.g. onboard a domain *and* import keywords), run the
skills in order and reuse the resolved origin, key, and \`project_id\` across them.

## Rules

- **Plan before any write or admin call.** Read first (\`listProjects\`,
  \`listKeywords\`, etc.), confirm the target IDs, then mutate.
- Send an \`Idempotency-Key\` header on write calls you might retry.
- Treat IDs as opaque (\`prj_...\`, \`kw_...\`, \`bsb_key_live_...\`).
- **Never reveal secrets** - API keys, provider credentials, or migration tokens.
- If a needed feature is absent from \`/api/v1/capabilities\`, stop and report it
  rather than guessing at endpoints.`,
  references: [
    {
      path: "references/discovery.md",
      content: `# Bisibility discovery & orientation cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\`.
Origin is either \`https://bisibility.com\` (hosted) or
\`https://your-host.example\` (self-hosted) - resolve before calling.

## Discovery URLs (no version prefix except OpenAPI/capabilities)

| URL | Purpose |
|-|-|
| \`/llms.txt\` | Agent-readable instance overview |
| \`/api/v1/openapi.json\` | Authoritative OpenAPI spec |
| \`/api/v1/capabilities\` | Enabled features, limits, providers |
| \`/.well-known/agent-skills/index.json\` | Published task-skill catalog |
| \`/.well-known/mcp/server-card.json\` | MCP server card (if enabled) |

## Orientation endpoints

| METHOD path | operationId | Notes |
|-|-|-|
| GET /liveness | getLiveness | Web process liveness; usually unauthenticated |
| GET /readiness | getReadiness | Database and blocking-migration readiness |
| GET /health | getHealth | Composite diagnostics, including worker and Temporal |
| GET /capabilities | getCapabilities | Feature/limit discovery |
| GET /projects | listProjects | Find your \`project_id\` |

## Conventions

- Lists: \`{ "data": [...], "meta": { "next_cursor": "..." } }\`; page with
  \`?limit=<n>&cursor=<next_cursor>\`.
- Errors: \`application/problem+json\`; \`429\` carries a retry window.
- Writes: optional \`Idempotency-Key\` header.
- Scopes: \`read\` < \`write\` < \`admin\`.

## Task skills to route to

provider-setup, domain-onboarding, keyword-import, alert-triage,
weekly-report, self-host-health, team-api-governance.`,
    },
  ],
};
