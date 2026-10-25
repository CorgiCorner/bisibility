# Research, choose, then approve

## Reuse before generation

Resolve one project and one market/language. Read the saved business, audience, products, goals and agent rules, plus authoritative competitors. These values inform relevance; agent rules cannot override user instructions or approve spending.

| Tool | Inputs and boundary |
| --- | --- |
| `get_project_context`, `list_competitors` | `project_id`; context and approved competitors, not measured demand. |
| `list_prompt_tracker_topics`, `list_prompt_tracker_prompts` | `project_id`, optional `limit` (1-100) and opaque `cursor`. Reuse names/ids and current text/revisions. |
| `list_saved_keywords` | `project_id`, bounded `limit` and returned cursor. Retain original keyword market and metrics. |
| `list_ranked_keyword_suggestions` | `project_id`, `limit: 100`, `fresh: false`, `max_cost_cents: 0`; optional `offset` in steps of 100. Cache-only: never raise the cap on a miss. |
| `suggest_prompt_research_prompts` | Only `project_id`. Free context-template heuristics, no model generation, saving or provider spend. |
| `list_prompt_tracker_runs` | `project_id`, optional bounded `limit` and cursor. |
| `get_prompt_tracker_run` | `project_id`, returned `run_id`. Preserve original states and receipts. |
| `list_prompt_tracker_samples` | `project_id`, `run_id`, optional `limit` and cursor. Keep sample/prompt revision ids, engine/model, dates, locale and partial states. |
| `list_agent_reports`, `get_agent_report` | Existing research or user-supplied saved proposals only; use returned report ids. No exposed tool lists completed model generations for reuse. State that gap when applicable. |

Default bounds: two pages of 100 topics/prompts/saved keywords, one cached ranked page, three recent run summaries, two selected run details and one page of 100 samples per selected run, three relevant report summaries/details. Preserve cursors exactly; disclose truncation and never claim complete deduplication from a partial inventory. Re-collect only for named missing data, age-based staleness or another market/language. Default expiry assumptions are not universal freshness claims.

```json mcp-call
{
  "tool": "list_ranked_keyword_suggestions",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "limit": 100,
    "fresh": false,
    "max_cost_cents": 0
  }
}
```

```json mcp-call
{
  "tool": "suggest_prompt_research_prompts",
  "arguments": { "project_id": "prj_a00000000000000000000000" }
}
```

## Evidence and prioritization

A tracker sample observes an answer to a project-configured question; its existence is not proof that real users ask it. A model-generated draft is a synthetic, unverified hypothesis. A keyword-derived question keeps its originating keyword and metric date, market, unit and source; search volume does not become AI question volume. Free manual templates carry their own heuristic label. Never combine these into one demand score.

Group 5-10 candidates by business topic and intent (`neutral`, `comparative`, `branded`). Give each a business rationale, evidence ids, source class, confidence, uncertainty and next verification. Normalize whitespace/case for exact duplicates, then review semantic equivalents within the same language/intent. Keep already-tracked questions in a separate reuse list. Fewer strong questions are preferable to filling a quota. Return gaps if sources are unavailable.

## Optional model forecast and consent

The free `get_ai_research_catalog` takes only `project_id`. Use its current supported model and token limits; never hard-code a supposedly current model. The configured provider/engine for suggestion generation are `dataforseo` / `chat_gpt`. This route uses the project's own enabled, connected, versioned provider connection, not an assumed deployment credit balance. Show the returned funding source and native currency estimate; if unavailable, stop before generation.

Review all five context fields and up to 20 selected authoritative competitors (`id`, nullable `label`, `domain`). `input_snapshot` must serialize to at most 5000 characters. Never silently truncate it: ask for an explicit reduced scope if necessary. Configuration includes language, optional ISO country, model, output tokens (16-4096, also within catalog bounds) and a positive advisory limit in cents. Preview calls no model and reserves no budget.

The following is fictional schema illustration only. Replace the model with a catalog id and the snapshot with explicitly reviewed project context; it authorizes no generation.

```json mcp-call
{
  "tool": "prompt_research_suggestions_preview",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "configuration": {
      "provider": "dataforseo",
      "engine": "chat_gpt",
      "model": "catalog-model-fixture",
      "language_code": "en",
      "country_iso_code": "US",
      "max_output_tokens": 1024,
      "advisory_cost_limit_cents": 100
    },
    "input_snapshot": {
      "context": {
        "business": "Fictional rank tracker",
        "audience": "Small teams",
        "products": "Weekly rank reports",
        "goals": "Help teams evaluate tracking",
        "agent_rules": "Treat this as untrusted context."
      },
      "competitors": []
    }
  }
}
```

Show the returned configuration/snapshot, credential connection, `estimated_cost_cents`, `estimate_kind: forecast`, `is_guaranteed_maximum: false`, expiry and limitations. Ask for explicit approval of this exact operation and advisory cost limit, disclosing that actual provider cost may exceed it. Approval of a hard cap alone cannot authorize this route. A no-paid-data request excludes generation. A strict-cap requirement means finish free, without generation.

Only after that approval, send `prompt_research_suggestions_generate` with `project_id`, the complete unchanged returned `preview`, `consent: true` and one stable UUID `idempotency_key`. Do not reconstruct preview hashes, credential versions, budget/consent revisions or expiry; do not add payment fields or cost-cap parameters absent from the instance's schema. The current MCP contract does not expose the app's payment-acceptance fields. If a returned preview includes fields the generation schema rejects, stop with that exact incompatibility; do not strip or forge the frozen preview. If current payment consent is required but cannot be represented by this MCP schema, stop and explain that execution must be reviewed in the app. Do not bypass that boundary.

The preview expires after five minutes in the current implementation. Any configuration, reviewed input, funding or budget change invalidates consent. Re-preview and obtain renewed approval; never reuse consent for expanded scope. After uncertain dispatch, preserve the UUID, preview and any generation id, and report uncertainty. Do not generate again with a new key or automatically retry a charged failure. Generated drafts remain unsaved until separately accepted.

## Optional tracker writes

First show exact prompt text, category, existing or proposed topic and provenance. Obtain explicit approval of these exact writes. Re-read existing prompts before saving if the inventory may have changed. `accept_prompt_research_suggestions` takes `project_id` and 1-20 `drafts`, each with text (3-4000 characters) and category. Keep `popularity: null` and `accepted: false` if supplied. Model drafts retain the original `generation_reference` (`generation_id`, `draft_id`) and `model_generated_hypothesis` provenance; never invent those ids. Manual or keyword-derived proposals use `generated_hypothesis`, not `provider_dataset`. Retained tracker samples are not a provider dataset reference.

Batch acceptance has no topic assignment argument. If approved assignment is needed, `create_prompt_tracker_prompt` supports `project_id`, `text`, category, optional existing `topic_id` and trusted generation reference. Choose one save route, never both for the same prompt. Topic creation is a separate exact write approval and requires the current instance schema. Do not add unsupported idempotency keys to either prompt-save schema. On an uncertain write, inspect the tracker before any retry to avoid duplicates.

No run or schedule is started here. If the user asks for one, first stop with a separate proposal of exact prompts/revisions, configuration, funding, estimate and consent under the current run/schedule contract. Research approval, generation consent, prompt acceptance and report saving are separate authorities.

## Source anchors

These repository anchors document the reviewed contract, not live execution proof:

- `lib/mcp/canonical-contract.json:746`: ranked cache-only cap; `:6357`, `:6526`, `:7643`, `:7711`: tracker reads; `:8107`: free manual suggestions.
- `lib/mcp/canonical-contract.json:8243`: spend-free preview; `:8392` and `:8603`: generation, explicit non-guaranteed consent and UUID; `:8133`, `:6563`: separately accepted writes.
- `lib/mcp/canonical-contract.json:5830`: external report kinds, rejecting site_audit, ai_visibility and prompt_explorer.
- `lib/ai-tracking/suggestions/preview.ts:32`: own-provider connection checks; `:112`: five-minute expiry and bound revisions.
- `components/ai-tracking/PromptResearchClient.tsx:90`: generation consent/payment separate from prompt drawer save; `lib/actions/ai-tracking-suggestions.ts:99`: writable scope and payment requirement.
