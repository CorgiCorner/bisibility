---
name: keyword-opportunity-research
description: Find queries the project already shows up for, then research paid keyword opportunities from one seed. Use when the user asks what they already show up for, or for related keywords, suggestions, ideas, search volume, difficulty, intent, or a prioritized keyword opportunity list. Do not use for rank movement reports, backlink analysis, website crawling, automatically adding tracked keywords, or any paid research run whose provider cost has not been estimated and explicitly approved.
---

# Keyword opportunity research

Start with the free "already showing up for" section, then make provider cost visible before any paid seed call. Keep the two sections separate.

1. Resolve the project with `list_projects` when needed.
2. Build the free section in [references/workflow.md](references/workflow.md). Use `list_search_performance_query_stats` for connected Search Console data, keeping its date interval and country/device aggregation. Where exposed, read cached ranked suggestions with `list_ranked_keyword_suggestions` and `max_cost_cents: 0` only. Surface queries with impressions but a weak position or low CTR that are not yet tracked. If Search Console is not connected, say so and do not invent those rows.
3. Present that free section on its own. Do not mix it into paid provider research.
4. Continue with paid seed research only after the user approves that path. Confirm one seed, result limit (`100`, `300`, or `500`), research mode, market context, and whether clickstream-refined volumes are needed.
5. Call `research_keywords` with `estimate_only: true`. This dry run does not call the provider or spend budget.
6. Show the estimate, planned parameters, cache state if reported, and a proposed `max_cost_cents` guard. Stop for explicit user approval.
7. After approval, call `research_keywords` with the same parameters and the approved `max_cost_cents`. Do not set `fresh: true` unless the user separately approves bypassing the 12-hour cache.
8. Validate source statuses and returned counts. Preserve partial results and explain sources marked failed or skipped.
9. Deduplicate and prioritize the paid rows in their own section, using the evidence and format in the workflow reference.

Stop before any paid provider call, `fresh: true`, a second seed, a larger result limit, `create_saved_keywords`, `add_keywords`, or external publishing. Each requires explicit approval immediately before the action. Saving ideas and starting rank tracking are separate decisions.
