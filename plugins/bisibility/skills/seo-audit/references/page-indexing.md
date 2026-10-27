# Page indexing workflow

Use the project's existing Search Console connection. These results are Google's
indexed state as already known to Google, not a live test, and may be partial or
delayed. Never use these operations as proof of current live crawlability.

1. `list_search_index_sitemaps` with `project_id` reads the sitemaps Google knows.
2. `get_search_index_sitemap` with `project_id` and the full sitemap URL in `path`
   reads the same normalized detail. Submitted counts are available; deprecated
   indexed counts are never exposed.
3. On an explicit inspection request, call `inspect_search_index_urls` with
   `project_id`, 1-10 `urls`, and an `idempotency_key` for safe retries.
   The operation requires write scope, normalizes URLs (duplicates after normalization count once) and validates the entire
   batch before any Google call. It cannot inspect outside the connected property.
4. Check every result's `error`. `inspection_daily_limit` means no call was made
   for that URL. `provider_authorization` needs reconnection. `inspection_failed` counts if the URL was sent. `provider_rate_limited` stops
   further calls and returns `reset_at` (ISO timestamp) and `scope` (`daily`,
   `minute` or `unknown`) for the affected and remaining admitted URLs. Only
   rate-limit errors include these fields.
5. Report verdict, crawl/fetch/robots/indexing states, canonicals, known sitemap
   and referring URLs, rich results and the inspection link when present. Keep
   missing fields and delayed data explicit. No mobile usability fields exist.

Every URL sent to Google counts, even when the call fails; URLs admitted but not sent because the batch stopped are released. Manual and background inspections share one project daily inspection allowance that resets at Pacific midnight, alongside the shared property counter. Other tools also consume quota, so the counter is an estimate.
Background checks exclude URLs already checked today. Successful inspections save
the latest verdict, crawl time, canonical agreement and check time. Full details
are returned in the response. Do not infer a complete report or history.

Read the stored report with `get_page_indexing_report`. Check `complete`,
`discovery_complete`, `remaining`, result times, budget mode, estimated property
usage and `next_reset_at` before drawing conclusions. Groups distinguish Google's
indexed/not-indexed verdicts from application inspection failures and unchecked
URLs. A bounded or failed sitemap discovery cannot claim a complete census.

Use `list_page_indexing_urls` for group, coverage state, sitemap, source and URL
search filters, cursor pagination and optional `history: "true"`. History returns
up to 100 changes per URL with its own completeness flag. Initial successful
inspection is a baseline; only subsequent tracked-field changes add rows. These
read-only operations never call Google. They show Google's indexed state, not a
live test, and may be partial.

`get_page_indexing_settings` lists available modes and Pacific reset information.
`update_page_indexing_settings` changes `budget_mode` and/or
`inspection_daily_limit` (0-2000). `off` disables background checks, `fixed` caps
project usage, and `available_quota` runs until a daily 429 within the run time
budget on Cloud and self-host. Shared property usage also
includes explicit inspections and retries; other tools' use is unobservable.

The report excludes manual-only URLs; list them explicitly with `source=manual`.
A missing Google reason is `Unspecified` and accepts that list filter. Synthetic
reasons have null coverage state: drill down by group alone. `checked_at` is the
last Google result, and `inspection_failed_at` is the last failed attempt.
