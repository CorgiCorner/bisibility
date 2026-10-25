# Keyword opportunity research workflow

## Verified MCP tools

| Tool | Use |
| --- | --- |
| `list_projects` | Find the project whose provider connection and budget apply. |
| `list_keywords` | Read tracked keywords so free findings can exclude queries that are already tracked. |
| `list_saved_keywords` | Read saved ideas that are not yet tracked. |
| `list_search_performance_query_stats` | Read connected Search Console query stats for a required `start_date` and `end_date`. |
| `list_ranked_keyword_suggestions` | Where exposed, read cached ranked suggestions. On the free path set `max_cost_cents` to 0 so a cache miss does not spend. |
| `get_provider_rates` | Read public provider rate cards when additional pricing context is useful. |
| `research_keywords` | Research related keywords, suggestions, or ideas from one seed. Supports `estimate_only`, `max_cost_cents`, `result_limit`, `mode`, `include_clickstream`, and `fresh`. |
| `create_saved_keywords` | Save approved ideas without starting paid rank tracking. This is a project write and requires separate approval. |

`research_keywords` uses the project's own DataForSEO connection and requires API write scope. A cache miss can spend provider budget. Results are cached for 12 hours. Clickstream-refined volumes double provider cost.

## Already showing up for (free, first)

Run this before any paid seed research and present it as its own section.

1. Call `list_search_performance_query_stats` with `project_id`, `start_date` and `end_date`. State that date interval in the section. Rows aggregate every country and device when no country or device filter is set and those dimensions are not requested. If you filter or group by country or device, say so. Do not treat the aggregate as one market's current rank.
2. Compare returned queries with `list_keywords` and `list_saved_keywords`. Keep queries that have impressions and a weak position or low CTR and are not yet tracked.
3. Where `list_ranked_keyword_suggestions` is exposed, call it with `max_cost_cents: 0` and `fresh: false`. That reads a cached page only. A cache miss returns `cost_limit_exceeded` and is not a paid call. Do not raise the cap on this free path. Record a miss as suggestions not collected.
4. If Search Console is not connected, say so, leave this section empty of invented rows, and continue with the paid path only after approval.

## Paid provider research

The paid section stays estimate-first and approval-gated. Do not fold Search Console rows into it.

## Estimate and approval contract

1. Always run `research_keywords` with `estimate_only: true` before the paid call.
2. Present the estimated cost, one seed, result limit, mode, clickstream choice, and whether cached data may be reused.
3. Ask for an explicit yes or no decision and an approved maximum in cents.
4. Pass the approved `max_cost_cents` to the paid request as a best-effort guard.
5. Treat the project's monthly provider budget as the hard stop and the estimate as approximate.
6. Never enable `fresh` silently. It bypasses the cache read and can pay again.

## Evidence handling

- Preserve each row's keyword, nullable search volume, 12-month trend, CPC, competition, difficulty, intent, source, and `already_tracked` state when returned.
- Preserve source-level `ok`, `failed`, or `skipped` statuses and machine-readable reasons.
- Do not replace missing metrics with zeros.
- Do not present provider metrics as forecasts or guaranteed traffic.
- Keep an exact record of result limit, returned unique count, cache status, estimated cost, and reported cost.

## Prioritization format

Group results into:

1. High-evidence opportunities
2. Useful secondary opportunities
3. Already tracked terms
4. Insufficient-data terms

Explain each priority using only returned volume, difficulty, intent, CPC, trend, and tracking state. End with a short list of candidate ideas to save. Do not call `create_saved_keywords` until the user approves the exact list. Do not call `add_keywords` as part of this skill.

## Schema-checked example calls

Free Search Console read. Replace the dates with the confirmed interval. Omitting country, device and those dimensions aggregates every country and device:

```json mcp-call
{
  "tool": "list_search_performance_query_stats",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "start_date": "2026-09-07",
    "end_date": "2026-10-06",
    "limit": 100
  }
}
```

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

Paid seed research. Illustrative inputs only. Replace placeholder IDs with returned IDs and confirm the exact scope. Caps below are examples, not quotes or approval. Run the free quote first; execute only after explicit approval of the exact operation and cap.

Free quote omits max_cost_cents:

```json mcp-call
{
  "tool": "research_keywords",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "seed": "example keyword",
    "mode": "related",
    "result_limit": 100,
    "include_clickstream": false,
    "fresh": false,
    "estimate_only": true
  }
}
```

Approval must label the positive cap best-effort (may slightly exceed). Approved execution:

```json mcp-call
{
  "tool": "research_keywords",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "seed": "example keyword",
    "mode": "related",
    "result_limit": 100,
    "include_clickstream": false,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100
  }
}
```
