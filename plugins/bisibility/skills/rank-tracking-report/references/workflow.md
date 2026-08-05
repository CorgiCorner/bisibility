# Rank tracking report workflow

## Verified MCP tools

| Tool | Use |
| --- | --- |
| `list_projects` | Find projects visible to the authenticated credential. |
| `list_keywords` | List tracked keywords with cursor pagination and optional filters. The maximum page size is 200. |
| `export_rank_history` | Export cursor-paginated project rank history as JSON with `30`, `90`, or `all` range and daily or weekly granularity. |
| `get_rank_history` | Inspect one keyword's cursor-paginated checks, optionally bounded by date and status. |
| `list_signals` | Optionally retrieve dated deploy, CMS, rank tracker, search analytics, sitemap, or URL inspection signals when the user asks for possible context. |

Do not call `run_rank_check`. It can incur provider cost and requires approval immediately before the call.

## Completeness checks

1. Follow every returned cursor until it is absent or the agreed cap is reached.
2. Record the requested keyword count, included keyword count, history row count, earliest timestamp, and latest timestamp.
3. Separate keywords with no completed checks from keywords whose position is absent in a completed check.
4. Label capped or failed pages as partial coverage. Do not extrapolate them to the entire project.
5. State the time zone used for the reporting boundary.

## Calculations

- Compare the earliest and latest completed observations inside the exact window.
- `latest position - earliest position` is the numeric delta. A negative value is an improvement.
- Report entries into and exits from top 3, top 10, and top 20 only when both boundary observations exist.
- Treat an absent ranking as worse than a numeric ranking, but label it as `not ranked` rather than assigning a fabricated number.
- Keep correlation language cautious when signals coincide with movement. A timestamp alone does not prove causation.

## Report format

1. Scope and coverage
2. Executive summary
3. Top gainers
4. Top losses
5. Threshold entries and exits
6. Data gaps and stale keywords
7. Optional contextual signals
8. Recommended next investigations

For every highlighted keyword, include its keyword text, earliest position and date, latest position and date, delta, and available ranking URL. Distinguish facts returned by MCP from calculations and interpretation.
