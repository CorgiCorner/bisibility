---
name: backlink-profile-analysis
description: Analyze and prioritize findings from a Bisibility backlink snapshot for one site or page. Use when the user asks about referring domains, backlink quality, new or lost links, broken backlinks, anchors, nofollow or sponsored flags, or a backlink profile report. Do not use for keyword research, rank movement reports, crawling, link outreach, disavow actions, or any provider call whose cost has not been estimated and explicitly approved.
---

# Backlink profile analysis

Analyze one site or page target with a visible provider-cost gate.

1. Resolve the project with `list_projects` when needed.
2. Confirm the target, `site` or `page` scope, subdomain handling, row mode, and result limit (`100`, `300`, `500`, or `1000`).
3. Call `analyze_backlinks` with `estimate_only: true`. This validates the target and estimates a cache-aware request without spending provider budget.
4. Show the estimate, planned parameters, cache information if reported, and a proposed `max_cost_cents` guard. Stop for explicit user approval.
5. After approval, call `analyze_backlinks` with the same parameters and approved guard. Do not set `fresh: true` unless the user separately approves paying to bypass an unexpired 24-hour snapshot.
6. Validate fetched row count against total rows available and label every row-derived aggregate as applying only within fetched rows.
7. Classify and prioritize the evidence using [references/workflow.md](references/workflow.md).

Stop before the paid call, `fresh: true`, `load_more_backlink_rows`, analyzing another target, external outreach, disavow changes, or publishing results. Each requires explicit approval immediately before the action.
