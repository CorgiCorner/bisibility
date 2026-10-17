import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "bisibility",
  title: "bisibility (router)",
  description:
    "Orient on a bisibility instance and route to the right task skill; use this first whenever an agent is asked to do anything with bisibility rank tracking and is not yet sure which task or endpoint applies.",
  compatibility:
    "Requires a resolved bisibility origin and a read-scoped bearer credential for project discovery; routed tasks may require write/admin scope or a personal token.",
  kind: "task-router",
  version: "0.1.1",
  body: `# bisibility (router)

Resolve the instance and project, then choose the task skill matching the user's
goal. This router does not execute the task. Do not turn orientation into an
unrequested health audit, provider probe or write workflow.

## Prerequisites

- Resolve the actual instance origin from the user or configuration; do not assume
  hosted. \`$BISIBILITY_BASE\` includes \`/api/v1\`.
- Keep the bearer credential in \`$BISIBILITY_API_KEY\`; never display or log it.
  A project key (\`bsb_key_live_...\`) selects one project. A personal access token
  (\`bsb_pat_live_...\`) can reach projects allowed by its memberships and scope.
- Read operations need read scope; writes need write; governance needs admin.
  Effective access also depends on project permissions. Project creation requires
  a write-scoped personal token; a project key cannot create another project.

## Minimal orientation

1. Read \`GET /capabilities\` for supported features, limits and contract versions.
   This endpoint is public. Sending a bearer header does not validate the key or
   tell you its scope.
2. Read authenticated \`GET /projects\` to resolve the intended project. Project
   keys return their scoped project; personal tokens return accessible projects.
   Follow \`meta.next_cursor\` as needed to find the target.
3. State the chosen skill, target and any missing prerequisite. Stop before
   executing the routed task unless the user also requested that execution.

For example: the user asks for last week's ranking changes. Resolve example.com,
then route to **weekly-report**, which reads saved checks and reports data gaps.
No paid checks or project changes are needed for this routing decision.

Personal-token paths containing \`/projects/{project_id}\` select that project.
For paths without it, pass \`X-Bisibility-Project: <prj_id>\` (or \`project\` query
parameter) when selection would otherwise be ambiguous.

## Routing table

| User goal | Skill | Credential tier |
|-|-|-|
| Connect or diagnose an intended provider | provider-setup | write |
| Create a domain project and initial targets | domain-onboarding | write personal token for creation |
| Add or reconcile a supplied keyword list | keyword-import | write |
| Investigate triggered alerts | alert-triage | write for changes |
| Audit retained AI mentions and citations | ai-visibility-audit | read |
| Summarize saved weekly ranking changes | weekly-report | read |
| Diagnose a self-hosted instance | self-host-health | read |
| Audit or manage keys, team access or migration tokens | team-api-governance | admin |

When a task spans skills, propose the order and reuse the resolved origin and
project. Each skill retains its own write, access and spending constraints.

## Additional discovery only when needed

- \`/api/v1/openapi.json\`: endpoint and request/response contract for this instance.
- \`/api/v1/llms.txt\`: API orientation text; do not require a marketing \`/llms.txt\`
  page on a self-hosted instance.
- \`/.well-known/agent-skills/index.json\`: published archive skill catalog.
- \`/.well-known/mcp/server-card.json\`: MCP server card when available.

Use **self-host-health** for liveness/readiness investigation rather than adding
those calls to every routing task. If a required feature is absent, report the
missing prerequisite and stop instead of guessing an endpoint.

## Shared rules

Lists return \`data\` with \`meta.next_cursor\`; errors use \`application/problem+json\`.
Honor 429 retry windows. Read and verify target IDs before approved mutations;
reuse stable idempotency keys for retried writes. Keep public project, keyword,
run and measurement IDs distinct. Never reveal API/provider/migration secrets.
Explicit approval is required before paid provider work; resolving a route does
not authorize writes, credential changes or spending.`,
  references: [
    {
      path: "references/api.md",
      content: `# Router - discovery and scope

Base: resolved instance origin + \`/api/v1\`.

| Endpoint | Evidence |
|-|-|
| GET /capabilities | Public features and contracts; not an auth check |
| GET /projects | Authenticated project selection |
| GET /openapi.json | Instance REST contract |
| GET /llms.txt | API orientation |

Read/write/admin tiers remain bounded by project permissions. Project keys select
one project and cannot create projects; creation needs a write personal token.
Use X-Bisibility-Project for ambiguous projectless personal-token calls. Route to
a task skill and stop before execution unless execution is requested. Do not run
health probes or paid work simply to choose a skill.`,
    },
  ],
};
