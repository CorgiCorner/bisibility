# Native text Responses adapter

Protocol review: 2026-11-11; source-evidence adoption reviewed 2026-11-12.
API: `/v1/responses`, non-streaming JSON; native
hosted search tool: `web_search` (unversioned). Capability revision:
`responses-text-20261111-v1`. Fixture revision: `responses-synthetic-v1`.
There is no SDK, direct fetch, retry, fallback, quote, credential lookup, or
module-initialization I/O here. All I/O uses the shared bounded transport.

`openAIModelProvider` implements the server-only ModelProvider port. `probe`
performs one explicit `/v1/models` metadata read, intersects exact listed IDs
with the table below, and returns only normalized metadata. A 401 maps to
`invalid_key`; other failures map to `unavailable`; a valid list without a
curated ID maps to `no_supported_models`. Fixture verification describes the
parser, never account entitlement or a successful real generation.

| Exact requested IDs | Documented output maximum | Temperature | Search |
| --- | ---: | --- | --- |
| `gpt-4.1`, `gpt-4.1-2025-04-14` | 32768 | Enabled, 0-2 | `web_search` |
| `gpt-5`, `gpt-5-2025-08-07` | 128000 | Disabled | `web_search`, medium reasoning |

The port further limits requests to 16-4096 output tokens. Only a documented
alias-to-snapshot response can complete in addition to an exact model match;
the requested column and returned snapshot remain separate. A different curated
actual model is retained with token evidence as a failed `invalid_response`,
never accepted as a substitution. An unrecognized/malformed actual ID fails
normalization without retaining arbitrary upstream strings. No prefixes,
future snapshots, specialized search models, fine-tunes, images, audio,
function calls, MCP, custom URLs, or other tool controls are enabled.

Search is optional (`tool_choice: auto`), with a default limit of one call,
caller-selectable up to ten, using only top-level `max_tool_calls`. This is the
documented bound across all built-in tools. Country hints are deliberately
disabled, despite the native API exposing approximate location: this adapter
has no vetted country policy/fixture set. Every country request is rejected
before admission, as are foreign tools, unsupported temperature and unknown
controls. No tool output triggers client-side execution.

Answers retain every `output_text` block in output/content order, separated
by a newline, up to 24 KiB UTF-8 without splitting Unicode characters.
Refusal explanations, reasoning summaries, error messages, arbitrary response
fields and headers are never projected. Incomplete responses, unfinished
messages/tools and application/citation truncation cannot become completed.
Only the minimal object/model/status/usage/tool-usage envelope and unknown output array
are parsed before nonterminal/cancelled responses return accounting-unknown. Strict
output, annotations and incomplete-reason parsing runs only for terminal responses,
as do integrity checks (model identity, output IDs and tool cap).
They retain best-effort usage, but no unchecked answer or citations. Unknown model IDs
are null; independent safe consulted URLs may remain. No terminal result is inferred.
Consulted search items are validated independently; malformed calls are skipped and
mark the source list truncated with unknown totals.
No polling follows.
Terminal responses rejected by an integrity check (for example output search calls
above the sent cap) settle as invalid_response without measured usage.

Citation occurrences retain their order and receive distinct occurrence IDs.
Source identity is SHA-256 of the canonical URL (WHATWG serialization, preserving
path/query/fragment). Repeated canonical URLs share identity. Native citations
have no provider source ID; injected/conflicting `source_id` fields are rejected.
Only HTTP(S) URLs without userinfo or whitespace are accepted. The 100 occurrence
limit also bounds unique retained cited sources; dropping occurrences or trimming
titles sets citation truncation. Citations beyond the retained answer are dropped.
For terminal responses without provider truncation, `citationTotals` counts all returned
annotation occurrences, with omissions equal to the difference from retained occurrences.
On provider truncation both counters are null: the shared nullable-total contract does
not define a returned-only subtotal as a complete total. Returned citations remain usable.
Trimming or nulling a title alone does not
increase the omitted-occurrence count. Lone surrogates or NUL in a citation title
produce a null title and citation truncation, retaining safe text, URLs and usage.
BMP block offsets become half-open UTF-16 ranges after adding block-prefix lengths.
The official schema does not specify supplementary-character indexing units, so
ranges in blocks containing supplementary characters remain null. Ranges in later
BMP blocks still include the exact UTF-16 length of any preceding Unicode blocks.
The previously reviewed terminal citation integrity policy is unchanged: malformed
annotations (including invalid URLs/offsets or injected source IDs) reject normalization;
only title repair and bounded omissions drop/adjust evidence with citation truncation.
Malformed answer text remains rejected. Supplementary consulted-source tolerance does
not relax those answer-linked checks.

Search requests opt into `include: ["web_search_call.action.sources"]`. Returned
`action.sources` URLs populate the separate `consultedSources` list, deduplicated
by canonical URL in first-seen order, sharing URL-derived IDs with citations.
Consulted-only URLs never become citations. Documented source entries have no title,
so titles are null; undocumented title fields, including malformed Unicode, are ignored.
The list retains at most 100 distinct URLs. Total and omitted counts are known only
for a completed response with at least one call, where every call is a completed
search action with an explicit sources array. An empty explicit list is known zero.
Missing lists/actions, non-search actions or unfinished responses retain null counts;
no calls, citations or billable usage are used to invent a total. Truncation records
actual dropped URLs independently of answer/citation truncation. Source entries are
parsed leniently, then validated individually. Unknown/malformed entry types, invalid
URLs, raw URLs over 2048 characters, and URLs exceeding that bound after canonicalization
are skipped. Any rejected entry makes total/omitted null and truncated true; answer,
citations, usage and outcome are unaffected. The shared transport
may trim this list further to fit the persisted-result byte budget, adjusting counters.

Token totals retain native input/output values. Cached reads/writes are subsets
of input, reasoning is a subset of output, and TTL cache-write quantities remain
subsets of cache writes. Missing dimensions stay null. Contradictory totals and
subsets fail terminal normalization. Nonterminal usage is at most partial (all-null stays
unknown) and validates each count separately; invalid counts become null. TTL quantities
are discarded with an unknown cache-write parent and otherwise bounded by that parent.
Contradictory cache/reasoning/TTL subsets become unknown,
retaining valid parent totals and unrelated measurements. A native total conflicting
with input plus output makes both input/output unknown. No repaired quantity is inferred.
`tool_usage.web_search.num_requests` is the sole source
of measured billable search requests; output items, search queries, opened pages
and citation counts are never converted to charged searches. A positive returned
search count with search disabled produces failed `invalid_response` evidence while
retaining measured usage (or accounting-unknown for a nonterminal response).
A returned billable search count above the sent `max_tool_calls` is retained exactly
and does not itself reject the result; the output-item count still obeys the cap.
The sent bound is not a guarantee of the provider's final billed count or cost.
Search content tokens remain unknown, so usage stays partial
when search was requested or a positive count was returned. An explicit zero count
with search disabled still permits complete, fully measured plain text usage while
money remains unknown. No rate card is installed: provider cost
always has null amount, unknown certainty/basis, no `costEvidence` and no payment receipt.
The route reports no supported monetary field, so lossless money parsing is not
enabled. Arbitrary upstream cost-like fields are ignored. No zeros
or decimal monetary amounts are inferred from tokens or native tool counts.

## Protocol sources

All sources accessed 2026-11-11, credential-free. API/tool versions are above.
The Responses reference and Web search Sources section were rechecked 2026-11-12
for the include path, source entry shape and billable-search semantics.
On that date the web-search guide also lists real-time feeds labeled `oai-sports`,
`oai-weather` and `oai-finance` in sources. The Responses reference still defines each
entry as `type: "url"` plus a URI string: an alternate non-URL wire type is unverified,
as are any upstream URL-length/list caps. Unknown types are tolerated defensively.

- [Responses request/response reference](https://developers.openai.com/api/reference/resources/responses/methods/create):
  `max_output_tokens`, `max_tool_calls`, temperature, output item/content ordering,
  `url_citation`, refusal, incomplete reasons, token/cache/TTL and hosted tool usage.
- [Model listing](https://developers.openai.com/api/reference/resources/models/methods/list):
  metadata list envelope and exact model IDs.
- [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1):
  exact snapshot, text output, Responses/search support and output ceiling.
- [GPT-5](https://developers.openai.com/api/docs/models/gpt-5):
  exact snapshot, text output, Responses/search support, reasoning and output ceiling.
  Sampling controls are conservatively disabled for this reasoning route.
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning):
  reasoning usage is included in output tokens and output bounds.
- [Web search](https://developers.openai.com/api/docs/guides/tools-web-search):
  native search actions, URL annotations, optional search, approximate location,
  and the difference between cited references and all consulted sources.

## Fixture provenance

No fixture is a live capture. All bodies and values are synthetic, modeled on
the documented schema, with only example.org source URLs. Source date, protocol,
tool and revision apply to every row, including all programmatically derived cases.

| Fixture/cases | Exact requested / returned model | Origin |
| --- | --- | --- |
| `__fixtures__/plain.json` | `gpt-4.1` / `gpt-4.1-2025-04-14` | Synthetic text, cache and usage values; Responses schema-derived structure |
| `__fixtures__/search.json` | `gpt-5` / `gpt-5-2025-08-07` | Synthetic search, repeated citations and reasoning values; Responses/web_search schema-derived structure |
| `adapter.test.ts`, plain fixture variants | Each of the four table IDs / its exact documented snapshot | Synthetic dispatch, temperature/tool controls, timeout and HTTP status cases |
| `catalog.test.ts` | Four curated IDs plus explicitly unsupported IDs | Synthetic metadata envelopes and 401/403/429/5xx echoes |
| `normalize.test.ts` | `gpt-4.1` / its snapshot, or `gpt-5` / its snapshot | Synthetic multiple blocks, Unicode, bounds, refusal, incomplete and malformed mutations |
| `usage.test.ts` | Plain fixture's `gpt-4.1-2025-04-14` shape | Synthetic cache/TTL/reasoning, zero, absent/partial and conflicting usage mutations |
| `sources.test.ts`, `adoption.test.ts`, `unsettled*.test.ts` | `gpt-4.1` / its snapshot, with deliberate mismatch cases | Synthetic consulted URL lists, malformed entries, missing evidence, Unicode titles, counters, byte limits, nonterminal conflicts and unknown money; no live capture |

Negative model cases deliberately use mismatched, malformed or unsupported IDs,
never as capability evidence. Synthetic arbitrary credential/prompt canaries do
not come from any account or environment.

## Integration requirements

This adapter is not user-runnable. Connection registration and authorized lazy
probe wiring (P03), durable observer/admission, consent and usage persistence
(P09, including observer deadlines), and frozen-column execution (P12) remain
required. Revalidate the account-scoped catalog/credential revision at execution.

The shared result extensions and transport switch are available on this branch.
This adapter adopts sources and citation totals through that transport and its
observer; it remains unregistered. No metadata pagination or cost-evidence extension
applies to this route. Missing consulted-source evidence remains explicitly unknown.
Precise ranges in supplementary-character blocks require documented upstream
offset semantics. Those are explicit limitations, without parallel result fields.
Account entitlement, vendor charges and production behavior remain unverified.
