---
name: rank-tracking-report
description: Build an evidence-backed ranking movement report from a Bisibility project's tracked keywords and rank history. Use when the user asks for ranking gains, losses, top-position entries, declines, or a weekly or monthly SEO ranking summary. Do not use for website crawling, technical audits, keyword discovery, backlink analysis, fresh rank checks, or publishing a report externally.
---

# Rank tracking report

Produce a read-only report from existing Bisibility data.

1. Resolve the project with `list_projects` when no project ID is provided.
2. Confirm the reporting window, keyword scope, and output format. Default to 7 days and at most 200 tracked keywords.
3. Paginate `list_keywords` until the agreed scope is complete. Stop and ask before exceeding the keyword cap.
4. Paginate `export_rank_history` with a range that covers the window, then filter to the exact dates locally. Use `get_rank_history` only to verify notable or ambiguous rows.
5. Validate completeness by comparing the requested keyword set with keywords represented in history. Report missing checks and partial pages explicitly.
6. Calculate movement with the convention that a lower numeric position is better. Never convert an absent position to zero.
7. Return the prioritized report described in [references/workflow.md](references/workflow.md).

Stop before calling `run_rank_check`, changing project data, increasing the agreed scope, or publishing or sending the report outside the conversation. Ask for explicit approval if the user wants any of those actions.
