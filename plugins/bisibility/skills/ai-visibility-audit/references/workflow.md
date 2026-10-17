# Evidence, comparisons and optional research

## Saved collection

Resolve the reporting window in UTC. List topics/prompts and at most ten runs, then inspect each selected run and at most ten pages of 100 samples per run. Lists accept project_id, limit and cursor; samples additionally require run_id. Filter dates locally when a list has no date argument. Record every omitted page/run. Preserve immutable prompt revisions and distinguish neutral, comparative and branded prompts; generated hypotheses are not measured demand.

Read at most three report summaries per kind initially using `list_agent_reports` with project_id, kind and limit, then `get_agent_report` with project_id and report_id. Built-in body shapes may contain input/result and camelCase observation fields; inspect actual returned data rather than assuming the MCP snake_case argument shape applies inside JSON. Distinguish transport wrappers from the resource; stop on isError/problem details.

For each retained sample, preserve run/sample/prompt revision IDs, source, engine, actual model (unknown stays unknown), requested/effective locale, observation and retrieval time, freshness, citation URLs, matched alias and a short answer excerpt. Keep unused search results separate from cited sources. An alias match is a heuristic, not sentiment, accuracy or ranking. Cached samples retain their original observation date.

Count answer_present, aio_not_present, partial, failed, unavailable and missing separately. Exclude incomplete answers from mention-rate denominators; an absent Google AI Overview is observed absence, not a mention failure. Show expected and eligible denominators, truncation and cost receipt state, including unknown costs. A provider dataset is limited provider evidence, not all consumer conversations. Synthetic prompt results are controlled model tests, not consumer visibility or verified citation links. Never combine these sources into one visibility score.

`get_ai_tracking_trends` requires project_id and run_id, optionally previous_run_id, limit and cursor. Use it only with identical prompt revisions, source/configuration, locale, model and brand/competitor configuration. Require at least 90% complete coverage in each period; otherwise state that comparison is unsupported. Missing or truncated evidence does not establish improvement or decline.

## Proposed changes

For each of up to three recommendations, name the specific question, observed gap, relevant owned page and answer section, facts needed, benefit mechanism, effort, uncertainty and acceptance check. Distinguish domain citations from brand mentions. Explain the strongest deferred alternative. Missing evidence supports a collection/verification proposal, not a confident content diagnosis. Any later measurement is an unexecuted experiment with unchanged comparison configuration and the same coverage requirements.

## Paid extension

Honor no-paid-data requests. Both optional tools require confirmed project_id, brand and domain. `analyze_ai_visibility` additionally needs the reviewed platform, target_type, location_code, language_code and limit. For `compare_ai_prompts`, discover models using `get_ai_research_catalog`; review exact prompt, models, response_language, max_output_tokens and web_search (keep false for controlled synthetic tests). Do not assume a market or model, or silently choose a different one after an estimate failure.

Estimate the exact operation with estimate_only true, max_cost_cents zero, fresh false and, for comparisons, cost_policy hard_cap. Show advisory estimate, BYOK/credit source if known, unknown accounting and external client fees. BYOK can still cost money. Obtain explicit approval of inputs and a hard cap before execution; keep the same inputs and stable idempotency key. Do not switch to provider_actual_cost, bypass the cache or broaden scope under the old approval. If hard-cap execution is unavailable, finish the free audit and state the blocker.

An estimate or cap is not a charge receipt. Preserve confirmed/unknown costs, failure and cache state. After uncertain provider acceptance, reconcile the durable returned record; do not replay or use a new key to force another attempt. 401/403 stop that action; 423 can leave reads available; honor 429 retry timing. Missing/denied tools never justify credential switching.

## Porting limits

The archive can generate/accept model drafts and preview/dispatch fresh tracker runs. Those are separate mutation and cost-consent workflows, excluded here. MCP has no guarded arbitrary citation-page retrieval tool; retain URLs as unverified and propose manual verification instead of shell fetching or inventing a fetch tool. No prompt generation, baseline, schedule, experiment execution or external report sharing is automatic.

## Schema-checked example calls

Illustrative inputs only. Replace placeholder IDs with returned IDs and confirm the exact scope. Caps below are examples, not quotes or approval. Run the free quote first; execute only after explicit approval of the exact operation and cap.

Free quote with a zero cap:

```json mcp-call
{
  "tool": "analyze_ai_visibility",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "brand": "Example",
    "domain": "example.com",
    "platform": "chat_gpt",
    "target_type": "domain",
    "location_code": 2840,
    "language_code": "en",
    "limit": 10,
    "fresh": false,
    "estimate_only": true,
    "max_cost_cents": 0
  }
}
```

Approved execution with a hard cap and a stable key for this exact operation:

```json mcp-call
{
  "tool": "analyze_ai_visibility",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "brand": "Example",
    "domain": "example.com",
    "platform": "chat_gpt",
    "target_type": "domain",
    "location_code": 2840,
    "language_code": "en",
    "limit": 10,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100,
    "idempotency_key": "example-analyze_ai_visibility-approved-1"
  }
}
```

Free quote with a zero cap:

```json mcp-call
{
  "tool": "compare_ai_prompts",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "brand": "Example",
    "domain": "example.com",
    "prompt": "Compare example.com and example.org for keyword research.",
    "models": [
      "gpt-4.1-mini"
    ],
    "cost_policy": "hard_cap",
    "web_search": false,
    "fresh": false,
    "estimate_only": true,
    "max_cost_cents": 0
  }
}
```

Approved execution with a hard cap and a stable key for this exact operation:

```json mcp-call
{
  "tool": "compare_ai_prompts",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "brand": "Example",
    "domain": "example.com",
    "prompt": "Compare example.com and example.org for keyword research.",
    "models": [
      "gpt-4.1-mini"
    ],
    "cost_policy": "hard_cap",
    "web_search": false,
    "fresh": false,
    "estimate_only": false,
    "max_cost_cents": 100,
    "idempotency_key": "example-compare_ai_prompts-approved-1"
  }
}
```
