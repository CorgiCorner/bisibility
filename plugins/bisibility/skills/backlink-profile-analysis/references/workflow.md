# Backlink profile analysis workflow

## Verified MCP tools

| Tool | Use |
| --- | --- |
| `list_projects` | Find the project whose provider connection and budget apply. |
| `get_provider_rates` | Read public provider rate cards when additional pricing context is useful. |
| `analyze_backlinks` | Return summary metrics, 12-month history, and backlink rows for a domain or page. Supports `estimate_only`, `max_cost_cents`, `fresh`, row mode, and result limit. |
| `load_more_backlink_rows` | Extend an unexpired snapshot in paid blocks of 100 rows. Never call it without separate approval. |

`analyze_backlinks` uses the project's own DataForSEO connection and requires API write scope because a cache miss can spend provider budget. One paid snapshot per target is cached for 24 hours.

## Estimate and approval contract

1. Always call `analyze_backlinks` with `estimate_only: true` first.
2. Present target, scope, subdomain choice, row mode, result limit, estimated cost, and cache status.
3. Ask for an explicit yes or no decision and an approved maximum in cents.
4. Pass the approved `max_cost_cents` to the paid request as a best-effort guard.
5. Never enable `fresh` silently. It skips the cache read and can pay again.
6. Never call `load_more_backlink_rows` as an implicit completeness step. Report current coverage and ask first.

## Evidence model

The summary may include total backlinks, referring domains, dofollow percentage, domain rank, broken backlink and page counts, and provider-lifetime new and lost counts. The 12-month history reports monthly new and lost links.

Rows may include source domain and URL, anchor, target URL, nofollow, UGC, sponsored, image, and sitewide flags, links count, referring-domain authority on the provider's 0-100 scale, spam score, first-seen date, lost date, and status.

- Keep provider-wide summary metrics separate from calculations over fetched rows.
- Label row-derived percentages and distributions as `within fetched rows`.
- Treat new and lost status as provider markers, not as a comparison invented from two snapshots.
- Do not infer that high authority proves relevance or that a spam score alone proves harm.
- A successful empty result is evidence of no returned backlinks, not a tool failure.

## Report format

1. Scope, cost, cache, and row coverage
2. Profile summary
3. New and lost trend
4. Strongest evidence-backed links
5. Lost, broken, or suspicious links for manual review
6. Anchor and link-attribute observations within fetched rows
7. Data limitations and recommended next investigations

Do not perform outreach, publish findings, or recommend a disavow action as an automatic consequence of this report.
