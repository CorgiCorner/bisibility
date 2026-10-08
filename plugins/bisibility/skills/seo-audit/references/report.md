# AgentReport payload and link

Use `kind: seo_audit` for external analysis. `site_audit`, `ai_visibility` and `prompt_explorer` are reserved, including case variants. Only these top-level MCP fields are accepted: `project_id`, `kind`, `title`, `body`, `provenance`, optional `idempotency_key`. Do not send `html`, `summary`, `skill`, `reportId` or a public sharing flag.

Write plain text and bounded JSON objects/arrays. The app renders text safely, not arbitrary HTML or Markdown layout. Title: 1-160 characters; body: at most 256 KiB UTF-8; provenance: at most 32 KiB; each object: depth at most 16 and 20,000 nodes; REST body: at most 320 KiB. Aim below 64 KiB overall. Include selected evidence, not full raw answers/pages. Check UTF-8 bytes, not character counts.

The bundled `scripts/validate-report.mjs` checks this skill's recommended shape and server-compatible bounds without any networking. Run it on the actual payload, then pass that parsed object to `create_agent_report`. [example-report.json](example-report.json) is fictional test data: replace every ID, date, observation and conclusion. Never save it as a customer audit.

Recommended body fields:

- `version: 1`, `summary`: short verdict and top action.
- `context`: business goal and explicitly labeled assumptions.
- `coverage`: crawl source ID, state/stop reason, limits, sampled pages and gaps. Keep partial/failure details readable.
- `recommendations`: zero to three ranked items with `priority`, `category` (`technical`, `content`, `visibility`), `action`, affected `urls`, `evidence_ids`, `rationale`, `benefit`, `effort`, `confidence`, `uncertainty`, and `verification`. Confidence expresses evidence strength, not a promise of ranking gains.
- `checked`: deferred candidates and reasons, including strongest runner-up; `visibility`: observed and synthetic coverage separately; `costs`: funding, estimates/confirmed/unknown usage and approved/skipped paid extensions.
- `evidence`: IDs with `type` (`http_crawl`, `saved_ranking`, `first_party`, `observed_dataset`, `synthetic_prompt_test`), `source_tool`, source report ID when applicable, safe source `url` or null, `observed_at` (null if unknown), `retrieved_at`, concise `fact`, and source parameters/limits. For date ranges retain the period too.

Provenance: skill slug/version, external agent/model identity only when known (otherwise `unknown`), audit time, instance, source IDs/tool names and limitations. Never label a fixture as live, a proposal as measured, retrieval time as observation time, or an external agent as a built-in Bisibility analyst. Report fixture/demo/user-supplied origin explicitly if applicable.

Source and affected URLs must be absolute HTTP(S), without credentials. Reject script/data/file URLs; never execute or automatically fetch citations. Use only the trusted configured HTTPS app origin for the final link. Hosted MCP resource origin is `https://bisibility.com`; regional REST issuer is not an alternative hosted app link. On self-hosted instances use the configured app origin.

Create returns the resource directly, including `id` and `created_at` (no returned `url`). Read it back using `{project_id, report_id: id}` and compare the title, kind, evidence and recommendations. Construct `/app/<project_id>/agent-reports/<id>` only from validated public IDs. The link inherits project access; possessing an ID does not grant membership and saving does not enable public sharing.

Suggested final response: “Saved the audit: [Open report](trusted-link). First: <action>. Coverage: <sample/limits and unavailable data>.” If creation failed, state “Not saved” and the exact blocker, with the useful findings still available. If no action is warranted, state that verdict plainly.
