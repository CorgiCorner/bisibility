# Route from intent to a shipped plugin skill

| User need | Next command and reason |
|-|-|
| Set up a domain or save goals, audience, products, competitors and key pages | `/bisibility:project-setup` - after research and a choice of what to track, establish reusable context and a confirmed setup plan. |
| Decide where to start | `/bisibility:seo-coach` - clarify the goal, then select one concrete next skill. Do not recursively invoke yourself. |
| Prioritize technical, content and visibility fixes | `/bisibility:seo-audit` - combine a bounded crawl with saved evidence. |
| Find queries already showing up, then new demand | `/bisibility:keyword-opportunity-research` - free Search Console section first, then paid research only after approval. |
| Explain weekly ranking gains and losses | `/bisibility:rank-tracking-report` - analyze saved checks. |
| Review link quality and referring domains | `/bisibility:backlink-profile-analysis` - analyze a backlink profile with cost approval. |
| Explain retained AI mentions/citations | `/bisibility:ai-visibility-audit` - separate observed visibility from synthetic tests. |
| Investigate noisy or sudden ranking alerts | `/bisibility:alert-triage` - corroborate alerts against rank history. |
| Group existing phrases into pages and check conflicting targets | `/bisibility:keyword-clustering` - use intent heuristics and saved evidence before optional enrichment. |
| Understand one competitor's keywords, pages and strategy | `/bisibility:competitor-analysis` - compare one rival with the tracked project baseline after a complete cost plan. |
| Compare who leads across a market | `/bisibility:competitive-landscape` - map the project plus up to five rivals with per-domain estimates and one approved total cap. |
| Choose questions to track in AI assistants | `/bisibility:ai-prompt-research` - saved prompts and free hypotheses first; generation and writes need separate approval. |
| Explain local map results across an area | `/bisibility:local-seo` - read retained Local monitor runs. Do not create a monitor or launch a run. |
| Create a domain project and confirm defaults | `/bisibility:domain-onboarding` - REST setup after research and a choice of what to track. Paid checks stay separate. |
| Choose a task when the endpoint is unclear | `/bisibility:bisibility` - resolve the instance, then stop before the routed task. |
| Import or reconcile a chosen keyword list | `/bisibility:keyword-import` - REST writes after research and an explicit choice. Fresh checks need their own approval. |
| Summarize saved ranking changes for one window | `/bisibility:weekly-report` - read-only REST report from saved checks. |
| Connect or diagnose a provider | `/bisibility:provider-setup` - REST credential workflow. Never print secrets. |
| Review keys, team access or migration tokens | `/bisibility:team-api-governance` - admin REST governance. An audit creates no secrets. |
| Diagnose instance liveness or a known run | `/bisibility:self-host-health` - read-only REST checks, with no repairs. |

## Research before tracking

When the goal is new tracking or what to do next, route in this order: research, choose, then tracking setup.

1. Research. Prefer Search Console "already showing up for" through `/bisibility:keyword-opportunity-research`. Use `/bisibility:competitor-analysis` or `/bisibility:competitive-landscape` when the goal is competitive.
2. Choose which queries or pages to track.
3. Tracking setup. Only then recommend `/bisibility:keyword-import` or `/bisibility:project-setup`.

Before recommending a new research run, reuse saved data. Read `list_keywords`, `list_saved_keywords`, `list_agent_reports`, `list_site_audits` and `list_competitors`. Where `list_ranked_keyword_suggestions` is exposed, cached reuse is `max_cost_cents: 0` and `fresh: false` only. A cache miss means the suggestions were not collected. Do not raise the cap. Recommend re-collection only when the saved data is missing, stale (state the age) or for a different market or device. This skill does not execute the research or the setup.

Cached ranked suggestions only. `max_cost_cents: 0` refuses a cache miss before any provider call:

```json mcp-call
{
  "tool": "list_ranked_keyword_suggestions",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "fresh": false,
    "limit": 100,
    "max_cost_cents": 0
  }
}
```

A precise user goal needs no extra question. For a broad request, first resolve the project and ask which outcome matters (setup, rankings, content, links or Brand Visibility); count each question toward the limit of two. Use saved goals if already sufficient. If ambiguity persists, state what remains unknown and give an explicitly conditional route. Never select a project merely because it is the first list result.

Start with context. Additional reads are optional and bounded: at most 50 tracked keywords, 50 saved keywords, 50 triggered alerts, three report summaries, one latest site audit and one page of competitors. A ranked-suggestion reuse stays at `max_cost_cents: 0`. Respect each tool's real input schema and response cursor; if the sample is incomplete, label it. No fresh crawl, provider estimate, report save, tracking change or paid call belongs here, even if the tool is exposed.

Recommend only skills in this table. Domain onboarding, the router, keyword import, weekly report, provider setup, team API governance and self-host health use the REST API and a bearer credential. The other listed skills use MCP tools. Do not recommend planned skills. If none fits, say there is no matching workflow and describe the gap plainly. Do not route unrelated writing or general questions into Bisibility.

Example: for 'What should I improve next for example.com?' with a clear saved goal and recent alerts, recommend `/bisibility:alert-triage` with the reason 'Verify the recent drops before choosing page changes.' An unreadable project means the reason must rely on the user's request, not invented saved evidence.
