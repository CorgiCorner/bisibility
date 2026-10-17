# Clustering workflow

## Bounded free inputs

Resolve the project even for a user-supplied list; ask which project if unclear. Preserve original phrases, user file/row references and any supplied URLs. Deduplicate exact normalized phrases only within the same market, retaining aliases and source IDs. Do not merge languages, markets or distinct intent just because words overlap.

`list_saved_keywords` returns saved ideas without rank tracking. `list_keywords` returns tracking data, target URLs and tags, with limit up to 200 and cursor. Supported filters include search, tag, topic, intent, position_gt/lt and sort; do not invent a cluster filter. Bound each source initially to two pages of 100 rows, disclose omitted rows, and ask before expanding a large supplied list. Optional `list_search_performance_query_stats` needs project_id, start_date and end_date, with limit up to 1000 (start at 100); query is optional. This is connected first-party data aggregated across countries/devices, not competitor or SERP evidence. No connection means unavailable, never auto-connect it.

## Method and page mapping

The agent clusters by shared intent, audience task, funnel stage and plausible page type using SERP-free lexical and semantic heuristics. State that no live SERP overlap was measured. Split 'how to' guides from purchase/evaluation pages when their tasks differ. For mixed or unclear intent preserve alternatives, lower confidence and name the needed manual check. Approved metrics may inform priority, but volume alone does not prove two terms belong on one page.

For each cluster retain member IDs/phrases, intent, primary keyword with selection reason, mapped target URL and its status (observed existing, user-confirmed, proposed or unknown), content priority, business rationale, confidence and uncertainty. An unknown URL is null with a proposed page role; never fabricate an existing page. Prioritize goal fit, existing evidence, effort and uncertainty. Do not sum overlapping volumes or present demand estimates as visits.

## Cannibalization evidence

Use `get_rank_history` with project_id and returned keyword_id, since/until and limit/cursor (up to 200, start at 100 for at most ten relevant keywords). Compare compatible markets, devices and dates. Record distinct successful ranking URLs and dates for the cluster, or exact conflicting saved target URLs and keyword IDs. Two or more distinct URLs observed in history or conflicting targets support a cannibalization candidate; neither proves ranking harm, simultaneous competition or causality. A lone current URL or similar wording is insufficient. Distinguish observed URL switching, target-map conflict, no conflict in the bounded sample, and unverified. No history means unknown. Never recommend deletion or redirects solely from a heuristic grouping.

## Optional paid enrichment and confirmed writes

`get_keyword_metrics` accepts up to 700 phrases of at most 80 characters, project_id, optional connection_id, include_clickstream, fresh, estimate_only and max_cost_cents. Do not truncate longer supplied phrases silently. Keep fresh and include_clickstream false unless separately approved. Quote the exact batch with estimate_only true and max_cost_cents omitted: the estimate is free and a supplied cap must be strictly positive. Show the batch and returned estimate, then obtain explicit approval of that exact batch and a positive best-effort cap (may slightly exceed). Execute only the approved batch with that cap. No idempotency_key is exposed, so no automatic retries or hard-cap guarantee. Without approval, finish the free clustering.

Tagging is optional: show each keyword ID, before/after tags and exact `bulk_update_keywords` add_tags/remove_tags payload (up to 500 IDs, at most 12 tags of 48 characters), project_id and stable idempotency_key, then obtain confirmation. Preserve unrelated tags; never include delete, schedule or target changes in a tagging approval. Re-read immediately before mutation; changed inputs need a refreshed plan. Verify using `list_keywords`.

Saving ideas is separate: show the exact `create_saved_keywords` rows (at most 500), project_id and stable key before confirmation. Supported row fields include keyword, intent, location, source_seed and actual measured metrics; there is no cluster or target URL field here. Do not pass invented fields or store inferred metrics as observed. Read `list_saved_keywords` before and after, report duplicates/skips, and never start tracking. If writes are denied, return proposed payloads and clusters read-only. AgentReport save requires its own explicit request.

## Evidence and failures

Use public IDs returned by tools. Check isError/problem details and unwrap transport once. Keep source observation time (null if unknown), retrieval time, market, device/depth where available, source IDs, cache state and pagination. Start with two pages of 100 tracked keywords; use limit/cursor and report omitted pages. A failed or unknown-coverage rank check is unknown, not absence. Only complete successful coverage establishes absence within its depth; a positive rank remains evidence within truncated coverage. No source proves traffic, conversion or revenue impact by itself.

401/403 stops that action; 423 may allow reads to continue; honor 429 retry timing. Never widen credentials. A missing provider or denied write leaves useful read-only analysis with named gaps. Stable idempotency keys apply only where exposed, to one exact logical payload; after uncertain writes read back before an identical retry and never rotate the key to force success. Estimates and caps are not charge receipts. Record confirmed, unknown and historical cost separately; BYOK still costs money and external client fees can remain unknown.

## Schema-checked example calls

Illustrative inputs only. Replace placeholder IDs with returned IDs and confirm the exact scope. Caps below are examples, not quotes or approval. Run the free quote first; execute only after explicit approval of the exact operation and cap.

Free quote, with max_cost_cents omitted:

```json mcp-call
{
  "tool": "get_keyword_metrics",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "keywords": [
      "example keyword"
    ],
    "include_clickstream": false,
    "fresh": false,
    "estimate_only": true
  }
}
```

Approved execution with a positive best-effort cap (may slightly exceed):

```json mcp-call
{
  "tool": "get_keyword_metrics",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "keywords": [
      "example keyword"
    ],
    "include_clickstream": false,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100
  }
}
```
