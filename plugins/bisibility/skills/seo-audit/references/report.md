# AgentReport payload and link

Use `kind: seo_audit` for external analysis. `site_audit`, `ai_visibility` and `prompt_explorer` are reserved, including case variants. Only these top-level MCP fields are accepted: `project_id`, `kind`, `title`, `body`, `provenance`, optional `idempotency_key`. Do not send `html`, `summary`, `skill`, `reportId` or a public sharing flag.

Write plain text and bounded JSON objects/arrays. The app renders text safely, not arbitrary HTML or Markdown layout. Title: 1-160 characters; body: at most 256 KiB UTF-8; provenance: at most 32 KiB; each object: depth at most 16 and 20,000 nodes; REST body: at most 320 KiB. Aim below 64 KiB overall. Include selected evidence, not full raw answers/pages. Check UTF-8 bytes, not character counts.

The bundled `scripts/validate-report.mjs` checks this skill's recommended shape and server-compatible bounds without any networking. Run it on the actual payload, then pass that parsed object to `create_agent_report`. [example-report.json](example-report.json) is fictional test data: replace every ID, date, observation and conclusion. Never save it as a customer audit.

Recommended body fields:

- `version: 1`, `summary`: short verdict and top action.
- `context`: business goal and explicitly labeled assumptions.
- `coverage`: crawl source ID, state/stop reason, limits, sampled pages and gaps. Keep partial/failure details readable.
- search_console_history, google_observation and site_crawl: separate section objects. Each states its own coverage. Search Console history is a date-bounded aggregate, not the current ranking.
- `recommendations`: zero to three ranked items with `priority`, `category` (`technical`, `content`, `visibility`), `evidence_class`, `action`, affected `urls`, `evidence_ids`, `rationale`, `benefit`, `effort`, `confidence`, `uncertainty`, and `verification`. `evidence_class` is one class, and every cited evidence row uses that same class. Confidence expresses evidence strength, not a promise of ranking gains. Do not use search_console_history as a current-visibility finding.
- `checked`: deferred candidates and reasons, including strongest runner-up; `visibility`: observed and synthetic AI coverage separately, not a merge of the three classes; `costs`: no new provider usage from this audit. Historical costs in saved source reports are context only, not charges from this audit. When saved AI reports are absent, record a coverage gap and point to the `ai-visibility-audit` skill as a separate workflow; do not offer to run it here.
- `evidence`: IDs with `class` and `type`. Class site_crawl pairs with `http_crawl`. Class google_observation pairs with `saved_ranking` and records market, device and observation time. Class search_console_history pairs with `first_party`, `list_search_performance_query_stats`, a `period` of `start_date` and `end_date`, and an `aggregation` note. AI stays outside those classes: observed_ai with `observed_dataset`, and synthetic_prompt with `synthetic_prompt_test`. Both AI types require `source_tool: get_agent_report` and a saved source report ID. Also record `source_tool`, source report ID when applicable, safe source `url` or null, `observed_at` (null if unknown), `retrieved_at`, concise `fact`, and source parameters/limits.

Provenance: skill slug/version, external agent/model identity only when known (otherwise `unknown`), audit time, instance, source IDs/tool names and limitations. Optional `source_tools` lists and nested `source_tool` fields must name only tools used to collect this audit evidence; AI evidence uses `get_agent_report`. Never label a fixture as live, a proposal as measured, retrieval time as observation time, or an external agent as a built-in Bisibility analyst. Report fixture/demo/user-supplied origin explicitly if applicable.

Source and affected URLs must be absolute HTTP(S), without credentials. Reject script/data/file URLs; never execute or automatically fetch citations. Use only the trusted configured HTTPS app origin for the final link. Hosted MCP resource origin is `https://bisibility.com`; regional REST issuer is not an alternative hosted app link. On self-hosted instances use the configured app origin.

Create returns the resource directly, including `id` and `created_at` (no returned `url`). Read it back using `{project_id, report_id: id}` and compare the title, kind, evidence and recommendations. Construct `/app/<project_id>/agent-reports/<id>` only from validated public IDs. The link inherits project access; possessing an ID does not grant membership and saving does not enable public sharing.

Suggested final response: “Saved the audit: [Open report](trusted-link). First: <action>. Coverage: <sample/limits and unavailable data>.” If creation failed, state “Not saved” and the exact blocker, with the useful findings still available. If no action is warranted, state that verdict plainly.
