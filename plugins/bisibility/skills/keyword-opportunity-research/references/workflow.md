# Keyword opportunity research workflow

## Verified MCP tools

| Tool | Use |
| --- | --- |
| `list_projects` | Find the project whose provider connection and budget apply. |
| `get_provider_rates` | Read public provider rate cards when additional pricing context is useful. |
| `research_keywords` | Research related keywords, suggestions, or ideas from one seed. Supports `estimate_only`, `max_cost_cents`, `result_limit`, `mode`, `include_clickstream`, and `fresh`. |
| `create_saved_keywords` | Save approved ideas without starting paid rank tracking. This is a project write and requires separate approval. |

`research_keywords` uses the project's own DataForSEO connection and requires API write scope. A cache miss can spend provider budget. Results are cached for 12 hours. Clickstream-refined volumes double provider cost.

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

Illustrative inputs only. Replace placeholder IDs with returned IDs and confirm the exact scope. Caps below are examples, not quotes or approval. Run the free quote first; execute only after explicit approval of the exact operation and cap.

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
