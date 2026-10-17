# Setup workflow and MCP boundary

## Read, draft, confirm

Use returned project IDs, not guessed IDs. `list_projects` accepts no pagination arguments. For a new domain, show the exact `create_project` arguments: name, domain, optional tracking_scope and stable idempotency_key. After confirmed creation, resolve the returned ID with `get_project` and read `get_project_context` before drafting subsequent writes. Approval for creation does not approve an unseen context or defaults payload.

`update_project_context` requires project_id and all five text fields: business, audience, products, goals, agent_rules (each at most 4000 characters). Merge with the read snapshot; do not erase omitted information. Store labeled competitor notes and absolute key page URLs in business, with product-specific pages optionally in products. These are text conventions, not new API fields. Show the full replacement text before confirmation. Re-read immediately before writing; changed context needs a refreshed diff and approval.

Read `list_competitors` before `add_competitor` (project_id, domain, optional label). Context notes do not create tracked competitor records. Confirm each proposed domain and label. Avoid duplicates on retries.

## Defaults and tracking

Read `get_project_defaults`; a change uses `preview_project_defaults` with project_id, required frequency and the exact proposed supported fields (country, location_key, city, device, timezone, jitter_minutes, cron_expression, serp_depth, serp_stop_on_match as applicable). Do not copy the archive's unreviewed defaults PATCH. Inspect the returned draft and impact. Copy the preview's expected_source_hash, expected_revision (keep it a string) and preview_token into the corresponding fields of the save request's review object, alongside a stable review.idempotency_key. Set review.confirmed true only after approval of the displayed draft and effects. Send the unchanged reviewed request values to `update_project_defaults` with that review object and stable outer idempotency_key. Never fabricate preview values or bypass a missing preview tool.

`add_keywords` takes project_id and keywords, not one REST call per keyword. Read existing rows first; show every phrase, target_url, market/device and schedule. Prefer an explicitly confirmed paused/manual schedule with cron_expression null until recurring tracking and its costs are separately approved. A schedule inherits defaults if omitted, so do not omit it without showing that effect. Bound each batch to the exposed schema (currently at most 500).

Only enable an existing sitemap monitor after `list_sitemap_monitors` and explicit confirmation using `enable_sitemap_monitor` with project_id and the returned monitor_id if needed. This is not an AI or local monitoring setup flow. No monitor creation or arbitrary monitor settings are implied.

## Verification, failures and gaps

Read back context, defaults, keywords, competitors and monitor state for the objects changed. A successful create is not evidence that rank checks completed. On uncertain writes, read back first; never rotate the key to force another attempt. On 401/403 stop that action; on read-only holds continue supported reads; on 429 honor retry timing. Partial setup should retain useful completed work without claiming readiness.

The REST onboarding skill connects/tests provider credentials and dispatches initial rank checks. This plugin intentionally drops those operations: credential management is outside setup, and initial paid checks are outside this confirmed setup plan. MCP exposes provider and rank-check operations, so this is a scope restriction, not a claim that those tools are missing. It does not automatically activate AI schedules or local monitors. There are no dedicated context fields for competitors/key pages; preserve them as labeled text and use separate competitor records only with approval. If a required tool is absent, report the exact gap and leave a reviewable plan.

Example plan: set up example.com, preserve existing business text, append key page https://example.com/pricing, add two confirmed phrases with manual schedules, and leave monitor enablement pending. Never execute this example as customer data.
