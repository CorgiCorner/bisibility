# One competitor, strategic comparison

Confirm one rival domain (for example example.org) against the project (example.com). Never silently expand to several rivals or pay for a project-domain overview: the project baseline is its saved tracked keywords. Start with at most 100 competitor rows and 100 pages, with all expanded loads frozen in the plan.

## Frozen cost plan

`analyze_domain_overview` requires project_id, target, location_code, language_code and max_cost_cents. Confirm keyword_limit (1-100), page_limit (1-1000) and scope_override root/subdomain; keep fresh false. Before paid calls run estimate_only true with max_cost_cents zero for these exact inputs. `estimate_domain_overview_cost` is a dedicated free alternative if exposed, with the same target/market/limits and zero cap, but do not bypass the required estimate-only gate when that tool is available.

The returned estimate exposes estimated_cost_cents for the initial overview (including its initial keyword/page modules), keyword_page_estimated_cost_cents and page_page_estimated_cost_cents for additional pages, and history_estimated_cost_cents. Preserve the exact response/inputs. Do not double-count the initial rows as extra pages. For an additional load use an estimate obtained with matching row limit; do not extrapolate a cheap small-page estimate to a larger page. Missing component estimates block that component, never substitute zero. History is lazy and separately priced, not included in the initial total. Sum every selected component before the first execution.

`load_domain_overview_keywords` and `load_domain_overview_pages` require the same target/market/scope, offset, limit and max_cost_cents (limits up to 100 and 1000 respectively). `load_domain_overview_history` requires target/market and max_cost_cents. These load tools have no estimate_only parameter: use the overview estimate's matching component prices, never invent the argument. Plan bounded offsets in advance (initially at most two additional pages per module); no unapproved pagination. An expired snapshot needs a new overview estimate and a newly approved plan, not automatic paid refresh.

Show operation, domain, market, limits/offsets, cache status, estimated cost, allocated positive per-call cap and total. Label overview caps server-enforced and backlink caps best-effort (may slightly exceed). Show subtotals for each cap type and sum all estimates and allocated caps honestly; a mixed total is not a guaranteed hard maximum. One explicit approval must cover the whole frozen plan, allocations, best-effort qualification and summed total before execution. A request to analyze is not spending consent. Keep fresh false; bypass requires separate approval and a new estimate. Even an expected cache hit needs approval for the non-estimate analysis call.

Execute sequentially, with sum of allocated call caps no greater than the approved total, each max_cost_cents bounded by remaining budget. Retain charged partial failures in accounting. Reuse returned cached results with original dates; do not force a refresh to make dates align. If costs are unknown, a server-enforced cap is unavailable where promised, actual spending exceeds the approved total or the next allocation exceeds remaining budget, stop paid work and report partial results. A disclosed best-effort backlink cap is allowed under the approved mixed plan; it is not a hard-total guarantee. Never claim a local budget ledger guarantees provider receipts. Domain Overview tools expose no idempotency_key: do not send it, retry uncertain acceptance or create a new attempt to resolve unknown accounting. Stable keys are used on report saves and confirmed mutations where supported.

## Market and comparisons

`get_project_defaults` returns effective schedule/SERP defaults with source explicit, derived or fallback, not necessarily numeric provider location_code and language_code. Present available defaults and their source. Require the user to supply/confirm an exact supported location_code/language_code pair if it is absent; country text is not a numeric code. Never assume US/en or derive a provider code by guessing. Compare tracked keywords only in this confirmed market; explicitly label mismatches or exclude them.

Use the project `list_keywords` baseline and returned competitor keyword rows, keeping provider estimates distinct from saved tracking. Normalize phrase case/spacing within a market; preserve original rows and duplicates. Overlap means a phrase appears in both bounded sets. A competitor phrase absent from the tracked set is a candidate tracking/content gap, not proof the project does not rank or lacks a page. Retain ranking URLs and positions, source snapshot dates and total available/consumed counts. Top pages are provider-ranked sampled URLs, not measured traffic or inspected content.

Only comparable source snapshots or history can establish a trend. Retain source_snapshot_at, fetched_at, previous_source_snapshot_at and per-module status when returned; retrieval time alone is not observation time. Historical index series is provider evidence, not a precise traffic trend. Without a compatible prior source snapshot, say trend unknown. Each action needs source evidence IDs, an owned target page or proposed page role, goal fit, effort, confidence, uncertainty and a manual/approved verification step. Explain the strongest deferred alternative.

## Optional link profile

Only include backlinks if requested in the frozen plan. Confirm target, target_scope site/page, mode as_is/one_per_domain, include_subdomains and result_limit (100, 300, 500 or 1000). Quote with `estimate_backlinks_cost` (no estimate_only or fresh arguments), or with `analyze_backlinks` using estimate_only true and fresh false. Omit max_cost_cents for either free quote; a supplied cap must be strictly positive. Include the exact target/options, quote and all backlink calls in the single frozen plan total. Obtain approval of that exact plan and allocated positive best-effort backlink cap (may slightly exceed), then execute with that cap. Keep best-effort and server-enforced overview line items distinguishable; do not describe their sum as a guaranteed hard bound. No paid idempotency key is exposed.

If approved evidence is available, retain summary, fetched links, history_unavailable and unknown-cost status separately. Link distribution is within fetched rows, not a full graph or proof of spam/penalties. A failure containing a partial summary is partial current-response evidence, not a successful cached snapshot. Do not seek links, contact sites or remove links.

## Evidence and failures

Use public IDs returned by tools. Check isError/problem details and unwrap transport once. Keep source observation time (null if unknown), retrieval time, market, device/depth where available, source IDs, cache state and pagination. Start with two pages of 100 tracked keywords; use limit/cursor and report omitted pages. A failed or unknown-coverage rank check is unknown, not absence. Only complete successful coverage establishes absence within its depth; a positive rank remains evidence within truncated coverage. No source proves traffic, conversion or revenue impact by itself.

401/403 stops that action; 423 may allow reads to continue; honor 429 retry timing. Never widen credentials. A missing provider or denied write leaves useful read-only analysis with named gaps. Stable idempotency keys apply only where exposed, to one exact logical payload; after uncertain writes read back before an identical retry and never rotate the key to force success. Estimates and caps are not charge receipts. Record confirmed, unknown and historical cost separately; BYOK still costs money and external client fees can remain unknown.

## Schema-checked example calls

Illustrative inputs only. Replace placeholder IDs with returned IDs and confirm the exact scope. Caps below are examples, not quotes or approval. Run the free quote first; execute only after explicit approval of the exact operation and cap.

Free overview quote and dedicated free alternative:

```json mcp-call
{
  "tool": "analyze_domain_overview",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "keyword_limit": 100,
    "page_limit": 100,
    "fresh": false,
    "estimate_only": true,
    "max_cost_cents": 0
  }
}
```

```json mcp-call
{
  "tool": "estimate_domain_overview_cost",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "keyword_limit": 100,
    "page_limit": 100,
    "max_cost_cents": 0
  }
}
```

Approved overview and separately allocated loads, priced by the matching overview component estimates. These examples have server-enforced caps; include all selected calls in the frozen plan:

```json mcp-call
{
  "tool": "analyze_domain_overview",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "keyword_limit": 100,
    "page_limit": 100,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100
  }
}
```

```json mcp-call
{
  "tool": "load_domain_overview_keywords",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "fresh": false,
    "offset": 100,
    "limit": 100,
    "max_cost_cents": 100
  }
}
```

```json mcp-call
{
  "tool": "load_domain_overview_pages",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "fresh": false,
    "offset": 100,
    "limit": 100,
    "max_cost_cents": 100
  }
}
```

```json mcp-call
{
  "tool": "load_domain_overview_history",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "location_code": 2840,
    "language_code": "en",
    "scope_override": "root",
    "fresh": false,
    "max_cost_cents": 100
  }
}
```

Optional backlink free quotes omit max_cost_cents. Include one quote in the frozen plan, not two billable line items:

```json mcp-call
{
  "tool": "estimate_backlinks_cost",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "target_scope": "site",
    "include_subdomains": true,
    "mode": "one_per_domain",
    "result_limit": 100
  }
}
```

```json mcp-call
{
  "tool": "analyze_backlinks",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "target_scope": "site",
    "include_subdomains": true,
    "mode": "one_per_domain",
    "result_limit": 100,
    "fresh": false,
    "estimate_only": true
  }
}
```

Approved backlink execution has a positive best-effort cap (may slightly exceed). Show its subtotal separately from the server-enforced overview subtotal, then sum both allocations:

```json mcp-call
{
  "tool": "analyze_backlinks",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "target": "example.org",
    "target_scope": "site",
    "include_subdomains": true,
    "mode": "one_per_domain",
    "result_limit": 100,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100
  }
}
```
