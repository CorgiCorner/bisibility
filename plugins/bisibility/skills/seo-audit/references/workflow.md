# Evidence collection and decisions

## Transport and tool contract

MCP schemas and the instance's OpenAPI are authoritative. Use public `prj_...` and `agr_...` IDs returned by tools. MCP arguments are snake_case. REST equivalents are `/api/v1/projects/{project_id}/context`, `/site-audits` and `/agent-reports` (append report ID for a detail read). `run_site_audit` accepts `max_pages`, not a URL or timeout. It runs against the stored project domain. `get_site_audit` requires `report_id`, not `audit_id`.

At v0.28.0, crawl/AI responses contain `data`; `get_project_context`, report create and report detail return the resource directly. Clients may wrap either in `structuredContent` or JSON text. Inspect the actual result, check `isError`/problem details, and unwrap the transport exactly once. Crawl response is `{id, created_at, cached, result}`; result uses `started_at`, `completed_at`, `stop_reason`, `limits`, `pages` and `limitations`. AgentReport `body` and `provenance` retain producer-defined key casing, so saved built-in crawl bodies use camelCase and AI bodies use `{input, result}` with `observedAt`, `fetchedAt`, `costStatus` and `totalAvailable`. Do not silently drop fields by assuming one casing everywhere.

No `whoami`, `get_audit_status`, `get_audit_issues`, `get_audit_pages` or `save_report` is needed. These are not Bisibility tool names. `create_agent_report` creates a new immutable analysis; it does not replace an existing report or accept HTML. Reuse a save idempotency key only for retries of that exact payload.

## Technical and content evidence

- Record crawl ID, target, dates, cache state, requested limit, sampled URLs, summary, stop reason and every limitation. `state: complete` means its queue ended within this bounded HTTP crawl, not that the entire site is audited. `partial` is usable evidence; never loop fresh crawls to bypass bounds.
- A `status: null`, `fetch_failed` or `robots_disallowed` row has unobserved content. Its `indexable: false`, empty headings, zero links/images and null metadata are placeholders, not proof of absent metadata or a deindexed page. A robots-disallowed URL does not establish a search indexing exclusion.
- For successfully fetched HTML, assess response errors, missing/duplicated metadata, heading purpose, robot directives, canonical consistency and sampled internal links. `indexable` is an HTTP/meta/X-Robots heuristic; indexing, canonical selection and penalties remain unverified. Response time is one HTTP sample, not Core Web Vitals or Lighthouse. Headings and links are capped samples; neither a single H1 nor multiple H1s proves quality by itself.
- The crawler does not supply full body text, schema validation, a full backlink graph, JavaScript rendering or a comprehensive sitemap inventory. Use title/description/headings as limited intent signals. If the supplied evidence cannot establish originality, topical depth, thin content or conversion friction, make a page-specific manual review recommendation with low confidence. Do not fabricate word counts, duplicated body text or content gaps.
- Content actions should specify the audience question, page section to inspect/change, information needed and acceptance check. Preserve pages whose successful rankings match the goal. Search volume is estimated demand, never measured visits or guaranteed gains. Do not invent conversions/revenue or sum overlapping query volumes.

## Three evidence classes

Keep these classes in separate report sections. Each finding names the one class that supports it. Do not merge them into one visibility claim.

### Historical Search Console data

`list_search_performance_query_stats` is first-party history for a required `start_date` and `end_date`. State that interval. Rows aggregate every country and device when no country or device filter is set and those dimensions are not requested. If you filter or group by country or device, say so. This class is not the current ranking. Missing permissions, reauthorization or an absent connection is a documented coverage gap. Never connect accounts or start analytics sync automatically. A low CTR note in this class needs actual clicks and impressions for that date range. It does not prove the current snippet.

### Current Google observation

`list_keywords` and `get_rank_history` are saved rank checks. Record the ranking URL, observation time, market and device. Read `latest_check`, `latest_successful_check`, depth and ranking URL before interpreting a null position. A failed check means unknown; a successful out-of-depth result means absent only within that depth. Different dates, markets or depths are not a trend. `get_rank_history` needs the returned `keyword_id` and project ID. A single sample cannot prove a traffic loss. Do not describe this class as Search Console history.

### Crawl results

The bounded site crawl is Bisibility's own HTTP sample of the project domain. Use it for access and metadata findings. It is not a ranking observation and not Search Console history. See the technical and content section for crawl limits.

## Saved AI evidence only

Saved `ai_visibility` reports contain `result.evidence: observed_dataset`: a provider's limited ChatGPT or Google AI Overview dataset. Saved `prompt_explorer` reports contain `synthetic_prompt_test`: controlled API model responses with web search disabled. Never merge these into one share-of-voice score or generalize to all user conversations. Verify the evidence discriminator rather than trusting only the report's kind.

Keep brand matching and domain citation separate. Record prompt/query, platform/model, market, source observation time (`observedAt`, possibly null), retrieval time, citation URLs, `totalAvailable`, truncation, `failure` and `costStatus`. A missing/empty dataset is not proof that a brand is never visible. Synthetic citations are model-returned strings, not verified live links or evidence of consumer visibility. Example visibility action: review a specific observed question that cites a competitor, identify an answer section on a relevant owned page, add verifiable facts, then record a separate measurement task for the `ai-visibility-audit` skill. A synthetic answer can motivate a hypothesis/manual fact check, never a high-confidence observed visibility diagnosis.

Read AI evidence only through `list_agent_reports` filtered by `ai_visibility` and `prompt_explorer`, followed by `get_agent_report` for selected IDs. If neither kind has saved reports, state the coverage gap and point to the `ai-visibility-audit` skill as a separate workflow. Do not offer or execute AI visibility research inside this audit. Do not request provider estimates, spending approval or paid provider calls.

## Prioritization and completion

For each candidate record evidence, goal relevance, likely benefit mechanism, effort, confidence and verification. Put demonstrated access defects affecting important pages first when justified. Then assess query/page fit and visibility gaps using comparable evidence. Severity counts or ease alone are insufficient. Use qualitative impact if no trustworthy baseline exists. Include checked-but-deferred items, the strongest runner-up's reason, and unavailable checks.

Before saving, independently re-read the evidence: could a partial crawl, failed lookup, stale ranking or synthetic answer invalidate the diagnosis? Reduce confidence or change it to a verification task. Keep observations separate from inferred causes, proposed copy and hypothetical outcomes. If no worthwhile action is supported, save that verdict and the specific remaining checks.

401/403: stop that action and report connection/scope/membership problem. 423: migration/read-only hold; reads may continue. 429: honor retry timing, do not tight-loop. Missing tool: report client snapshot/version limitation. A blocked save must be reported as unsaved with the analysis delivered in chat or a local artifact; never return a fabricated saved-report URL.
