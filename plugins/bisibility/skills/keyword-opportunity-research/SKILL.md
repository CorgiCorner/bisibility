---
name: keyword-opportunity-research
description: Research and prioritize keyword opportunities from one seed with Bisibility's paid provider-backed keyword research. Use when the user asks for related keywords, suggestions, ideas, search volume, difficulty, intent, or a prioritized keyword opportunity list. Do not use for rank movement reports, backlink analysis, website crawling, automatically adding tracked keywords, or any research run whose provider cost has not been estimated and explicitly approved.
---

# Keyword opportunity research

Research one seed at a time and make provider cost visible before any paid call.

1. Resolve the project with `list_projects` when needed.
2. Confirm one seed, result limit (`100`, `300`, or `500`), research mode, market context, and whether clickstream-refined volumes are needed.
3. Call `research_keywords` with `estimate_only: true`. This dry run does not call the provider or spend budget.
4. Show the estimate, planned parameters, cache state if reported, and a proposed `max_cost_cents` guard. Stop for explicit user approval.
5. After approval, call `research_keywords` with the same parameters and the approved `max_cost_cents`. Do not set `fresh: true` unless the user separately approves bypassing the 12-hour cache.
6. Validate source statuses and returned counts. Preserve partial results and explain sources marked failed or skipped.
7. Deduplicate and prioritize the returned rows using the evidence and format in [references/workflow.md](references/workflow.md).

Stop before any paid provider call, `fresh: true`, a second seed, a larger result limit, `create_saved_keywords`, `add_keywords`, or external publishing. Each requires explicit approval immediately before the action. Saving ideas and starting rank tracking are separate decisions.
