# Native Messages adapter

MP-P06, capability `messages-2026-10-21-p06-v1`, fixture revision
`mp-p06-doc-synthetic-v1`. Reviewed 2026-11-11. This exports the P01 port but
registers or activates no provider. No credential, provider account or live API
was accessed. Fixture verification does not establish entitlement or production
acceptance. All response values, counts, IDs and example sources are invented.

## Verified protocol and model scope

- [API versions](https://platform.claude.com/docs/en/api/versioning): the current
  documented version is `2026-10-21`, matching P04. This version removes
  `temperature`, `top_p` and `top_k` on every model. Temperature is therefore
  absent from capabilities and rejected before admission, including zero.
- [API overview](https://platform.claude.com/docs/en/api/overview): `x-api-key`
  remains a supported authentication fallback; version and JSON content type are
  required. Optional column `settings.workspaceId` sends only the fixed
  `anthropic-workspace-id` header on generation and every catalog page. There
  is no generic header override or alternate authentication path.
- [Messages](https://platform.claude.com/docs/en/api/messages/create): native
  non-streaming `POST /v1/messages`, exact JSON model, bounded `max_tokens`,
  user text and a language system instruction. The documented
  `output_tokens_details.thinking_tokens` is an output subset. Thinking blocks
  are excluded from the visible answer; no thinking control is exposed.
- [Model overview](https://platform.claude.com/docs/en/models/overview):
  `claude-opus-5-5` supports text output. This package deliberately supports only
  this exact ID, with a conservative application limit of 4096 output tokens.
  No aliases, model families, gateway identifiers or substitutions are inferred.
- [Search guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool):
  its current basic-search example explicitly pairs `claude-opus-5-5` with
  `web_search_20250305`. The P01 basic mode maps only to that tool, with
  `allowed_callers: ["direct"]`. `maxCalls` maps to `max_uses` (application cap
  10, also supplied when omitted). A validated ISO alpha-2 `countryCode` maps to
  `user_location: {type: "approximate", country: ...}`. US/PL mappings have
  synthetic request tests. Newer search versions, response inclusion, dynamic
  filtering, client tools and code execution are unsupported.

Catalog search also requires affirmative account metadata. The Models API's
generic search flag alone does not prove a particular tool version: the exact
documentation example and fixture intersection provide that additional boundary.

## Catalog output-limit policy

The [Models reference](https://platform.claude.com/docs/en/api/models/list), saved
on 2026-11-11, documents `max_tokens` as number or null. Null and omission both
mean unknown metadata. For the exact reviewed model, both retain the existing
4096-token application cap: the saved model overview lists 128K maximum output
for `claude-opus-5-5`, independently supporting this conservative cap. A numeric
metadata limit clamps the application cap downward and never raises it.
`maxOutputTokens` is this effective application bound; it does not assert a
numeric limit advertised by unknown metadata or prove account entitlement.
Unrelated null-limit models do not change the supported model intersection.
A malformed selected row still invalidates the catalog. Unrelated unrecognized
rows are skipped and counted in `recognition.skippedEntries`, with complete
traversal and partial recognition explicitly separate. IDs, page envelopes and
pagination remain strict; there is no replacement-model fallback. A numeric bound below
the product's 16-token minimum is omitted from the usable catalog; a sole
15-token candidate yields `no_supported_models`. A bound of 16 remains usable;
null/omission retains the reviewed 4096-token application cap. These boundary
values are synthetic tests, not claims about a live model's advertised limit.

## Bounded catalog pagination

[List Models](https://platform.claude.com/docs/en/api/models/list), re-read
2026-11-12, documents `after_id`, `limit` (default 20, range 1..1000), `has_more`
and `last_id` for forward pagination. `probe` now uses the shared
`readModelMetadataPages` traversal on the fixed `GET /v1/models` route. It
requests up to 1000 models per page, follows validated cursors and maps the
complete aggregate into the existing exact-model intersection.

One shared deadline (at most 120 seconds), 1 MiB decoded response budget, five
pages and 1000 unique models bound the whole traversal. Terminal results exactly
at the page/model limits are accepted. A nonterminal limit, duplicate or invalid
cursor/model ID, malformed page, later-page failure or deadline returns
`unavailable` with no catalog prefix, retry or fallback. Every page goes through
the shared metadata transport and account limiter; no custom URL, query or
arbitrary header is admitted. A complete empty/unsupported catalog yields
`no_supported_models`; 401 yields `invalid_key`. Listing does not prove generation
entitlement. Catalog snapshots include the requested workspace scope, and neither
cache nor launch validation reuses a snapshot for another workspace or omission.

## Normalized evidence

Text blocks concatenate without inserted separators. Retention is a full UTF-8
prefix of at most 24 KiB without splitting a Unicode scalar. Later blocks cannot
fill a byte gap left by a truncated scalar. Application/provider/citation
truncation flags remain independent.

The [search guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool),
re-read 2026-11-12, distinguishes `web_search_tool_result.content` result lists
from `web_search_result_location` citation passages on text blocks. Result lists
now populate `consultedSources`; only the text-block passages populate citation
occurrences. Repeated citations remain separate. Consulted URLs are distinct by
canonical `URL.href`, share the same deterministic source ID with citations, and
have their own 100-source cap. No source URL is fetched.

`citationTotals` counts returned citation occurrences before safety, answer-prefix
and count filtering. `consultedSources.total` counts distinct safe returned URLs,
including URLs whose titles or count bound prevent retention; it does not count
all pages the search engine may have considered. Both omitted counters describe
entries actually dropped. An unsafe/unidentifiable result URL makes the distinct
source total and omitted count null, with `truncated: true`. An observed empty
result list has known zero counts. When no result list was returned, the optional
consulted field stays absent; citations never synthesize a consulted list.

URLs retain the existing HTTP(S), no-userinfo and 2048-character limits. Full
citation and source titles are checked for lone surrogates and key echoes before
any shortening. Invalid titles drop the corresponding evidence with truthful
omission counts. Citation titles retain a safe prefix of 512 UTF-16 units and
mark citation truncation when shortened. Overlong consulted titles drop the
source, so the consulted truncation flag always reflects omitted entries. Valid
supplementary Unicode remains intact. Native excerpts supply no answer offsets;
both offsets stay null, without text matching.

Consulted-source omissions alone do not mark the answer partial. Citation
omissions/shortening still do. The shared transport can trim the consulted list
further to fit the persisted-result byte budget, updating its omitted/truncated
fields while retaining the answer, citations and usage. Observer settlement sees
that final fitted evidence. Money remains unknown; there is no documented
monetary receipt or new estimate to populate `costEvidence` or lossless money
paths here. No raw queries or encrypted continuation fields enter this projection.

[Stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons):
`end_turn` and `stop_sequence` can complete; `max_tokens`, context overflow,
`pause_turn` and `tool_use` are partial with provider truncation. Refusal is a
failed/refused result retaining safe response text and usage. Tool errors and
outstanding calls remain partial/provider_error. Unknown stops are partial with
invalid_response. Malformed content fails safely while retaining usable measured
usage. None of these paths resumes a turn, invokes a tool, retries or substitutes
a model. Exact returned model mismatch fails with unsupported_model and retains
the reported identity and usage. Actual upstream provider is null because the
native envelope does not explicitly report it.

[Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching):
input tokens exclude cache reads and cache creation. The adapter preserves that
uncached quantity with `inputCacheAccounting: additional`, the cache aggregate,
and 300/3600-second write subsets. Do not sum cache TTL subsets into the write
aggregate again. Output includes the reported thinking subset. Top-level usage
is retained without adding iteration rows. Search counts come from native
`server_tool_use.web_search_requests`, never inferred from blocks. Retrieved
search content is already input usage, so its unreported separate count stays
null. Missing/malformed/inconsistent dimensions remain partial or unknown.
Unknown future charge fields prevent complete usage. No unit prices, monetary
estimate, zero charge or payment receipt is invented; provider money is unknown.

P01 is a bounded projection. It cannot carry encrypted search continuation data,
raw queries, original stop details/tool errors or arbitrary future usage fields.
Those never enter the answer or error diagnostics. `rawEvidenceId` stays null;
P09/P12 must supply the existing retained-native-evidence reference if full
native-envelope auditing is required. This package implements no parallel raw
storage. Its source occurrences preserve returned link/title evidence, not
resumable tool state. A new billable dimension needs a shared evidence contract
extension before enabling a capability that requires it.

## Fixture provenance and integration

Every row uses access date 2026-11-11, API `2026-10-21`, exact model
`claude-opus-5-5`; search fixtures use only `web_search_20250305`.

| Fixture | Kind | Official shape source |
| --- | --- | --- |
| `__fixtures__/text.json` | Documentation-derived shapes, synthetic values | Messages create, caching links above |
| `__fixtures__/search.json` | Documentation-derived shapes, synthetic values | Basic search example, results, citations and usage sections above |
| `__fixtures__/catalog.json` | Documentation-derived shape, synthetic terminal subset | List Models and model overview above |
| Request/settings fixtures in `adapter.test.ts` | Synthetic, including US/PL and max-use mappings | Messages create, API versions and search localization/max-uses sections |
| Mutations in normalizer/content/usage/catalog tests | Synthetic negative/edge fixtures | Stop, cache and search shapes above; deliberately malformed variants are not vendor captures |
| HTTP/timeout/key/prompt-echo fixtures | Synthetic transport failures | P04 error/observer contract, not a live service response |

P03 owns registry activation; P12 must bind the current server-owned catalog,
authorized account/key revision, exact settings and consent before invoking this
adapter. It must not dispatch from an unavailable/expired catalog. P09 owns the
durable admission fence, observer timeout and native settlement independently of
money certainty. The adapter uses P04 for every metadata and generation call.
The cache utility only supplies the shared TTL; connection-revision-scoped cache
ownership stays with integration. Bounded pagination and workspace selection are
adopted; activation is still excluded.

## Adoption validation, 2026-11-12

New catalog traversal, 15/16/null, source/citation and Unicode variants are
synthetic tests derived from the two official references re-read above. Existing
request/model/version evidence retains its 2026-11-11 provenance. The adapter
stays unregistered. No live provider/account, database, workspace-selection or
production behavior was verified, and none is implied by fixture checks.


## Workspace selection and observation, 2026-11-12

[Authentication](https://platform.claude.com/docs/en/manage-claude/authentication#select-a-workspace)
documents the fixed request and response header `anthropic-workspace-id` and
`wrkspc_` alphanumeric examples. The local conservative validator accepts 1..64
alphanumeric suffix characters (71 total), not arbitrary header text. This is
an application bound, not a claim about every future provider ID.
An unscoped key needs the header; a workspace-scoped key cannot switch workspace.
HTTP failure codes retain the shared status mapping. A 400 receives a fixed
possible-cause hint; 404 receives access advice only when a selector was sent.
Provider error text is never read or echoed. No workspace retry occurs.
The purpose-keyed account digest and catalog cache bind the selector. The probe
accepts a separate typed selector, never a workspace credential field.

`resolvedWorkspaceId` is nullable observed response evidence, never copied from
the request. An absent, malformed or key-echoing header omits the key (semantically null). A different
valid observation is retained; the UI derives its mismatch notice without failing
the answer or promising limits, quota, budget or billing attribution. Fixtures
are documentation-shaped with synthetic IDs; no workspace behavior was tested live.

The routing-settings migration is a prerequisite only for results carrying an
observed workspace or a routing violation. Missing/malformed workspace evidence
omits `resolvedWorkspaceId` entirely (absence and null have the same contract
meaning), preserving results without routing evidence. HTTP failure codes retain
the shared status mapping. Workspace advice is an additional fixed hint: 400
suggests a possible selector cause, and 404 mentions access only when a selector
was sent. Ordinary failures are never classified as workspace failures.
