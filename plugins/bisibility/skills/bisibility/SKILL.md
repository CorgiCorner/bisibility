---
name: bisibility
description: Resolve a Bisibility instance and route to the matching task skill. Use when the task or endpoint is not yet clear. Do not use for executing that task, running a health audit or making unrequested writes.
metadata:
  bisibility.pack: router
  bisibility.requires: "ai-prompt-research ai-visibility-audit alert-triage competitive-landscape competitor-analysis domain-onboarding keyword-import keyword-opportunity-research local-seo provider-setup self-host-health team-api-governance weekly-report"
---

# bisibility (router)

Resolve the instance and project, then choose the task skill matching the user's
goal. This router does not execute the task. Do not turn orientation into an
unrequested health audit, provider probe or write workflow.

## Prerequisites

- Resolve the actual instance origin from the user or configuration; do not assume
  hosted. `$BISIBILITY_BASE` includes `/api/v1`.
- Keep the bearer credential in `$BISIBILITY_API_KEY`; never display or log it.
  A project key (`bsb_key_live_...`) selects one project. A personal access token
  (`bsb_pat_live_...`) can reach projects allowed by its memberships and scope.
- Read operations need read scope; writes need write; governance needs admin.
  Effective access also depends on project permissions. Project creation requires
  a write-scoped personal token; a project key cannot create another project.

## Minimal orientation

1. Read `GET /capabilities` for supported features, limits and contract versions.
   This endpoint is public. Sending a bearer header does not validate the key or
   tell you its scope.
2. Read authenticated `GET /projects` to resolve the intended project. Project
   keys return their scoped project; personal tokens return accessible projects.
   Follow `meta.next_cursor` as needed to find the target.
3. State the chosen skill, target and any missing prerequisite. Stop before
   executing the routed task unless the user also requested that execution.

For example: the user asks for last week's ranking changes. Resolve example.com,
then route to the `weekly-report` skill, which reads saved checks and reports data gaps.
No paid checks or project changes are needed for this routing decision.

Personal-token paths containing `/projects/{project_id}` select that project.
For paths without it, pass `X-Bisibility-Project: <prj_id>` (or `project` query
parameter) when selection would otherwise be ambiguous.

## Routing table

| User goal | Skill | Credential tier |
|-|-|-|
| Connect or diagnose an intended provider | `provider-setup` skill | write |
| Create a domain project and initial targets | `domain-onboarding` skill | write personal token for creation |
| Add or reconcile a supplied keyword list after research and an explicit choice | `keyword-import` skill | write |
| Investigate triggered alerts | `alert-triage` skill | write for changes |
| Audit retained AI mentions and citations | `ai-visibility-audit` skill | read |
| Summarize saved weekly ranking changes | `weekly-report` skill | read |
| Choose category questions for Prompt Tracker | `ai-prompt-research` skill | read; separate consent for generation or writes |
| Explain local map results from a retained Local monitor | `local-seo` skill | read |
| Diagnose a self-hosted instance | `self-host-health` skill | read |
| Audit or manage keys, team access or migration tokens | `team-api-governance` skill | admin |

## Research before tracking

Route research before new tracking. Research means queries the project already
shows up for in Search Console, keyword opportunity research with the
`keyword-opportunity-research` skill, and one-competitor or landscape comparison
with the `competitor-analysis` or `competitive-landscape` skill. For AI
assistant questions, route to the `ai-prompt-research` skill, which reuses saved
topics, prompts and free hypotheses before optional generation. Choose what to
track from that evidence. Only then route to tracking setup (the
`keyword-import` or `domain-onboarding` skill).

Before recommending a new research run, the chosen skill must reuse what was
already collected: saved keywords, saved or cached ranked keyword suggestions,
saved agent reports, the latest site audit and existing competitors. Recommend
re-collection only when that data is missing, stale (state the age) or for a
different market or device. This router still stops before executing the task.

When a task spans skills, propose that order and reuse the resolved origin and
project. Each skill retains its own write, access and spending constraints.

## Additional discovery only when needed

- `/api/v1/openapi.json`: endpoint and request/response contract for this instance.
- `/api/v1/llms.txt`: API orientation text; do not require a marketing `/llms.txt`
  page on a self-hosted instance.
- `/.well-known/agent-skills/index.json`: published archive skill catalog.
- `/.well-known/mcp/server-card.json`: MCP server card when available.

Use the `self-host-health` skill for liveness/readiness investigation rather than adding
those calls to every routing task. If a required feature is absent, report the
missing prerequisite and stop instead of guessing an endpoint.

## Shared rules

Lists return `data` with `meta.next_cursor`; errors use `application/problem+json`.
Honor 429 retry windows. Read and verify target IDs before approved mutations;
reuse stable idempotency keys for retried writes. Keep public project, keyword,
run and measurement IDs distinct. Never reveal API/provider/migration secrets.
Explicit approval is required before paid provider work; resolving a route does
not authorize writes, credential changes or spending.

Read [references/api.md](references/api.md) for the endpoint contract.
