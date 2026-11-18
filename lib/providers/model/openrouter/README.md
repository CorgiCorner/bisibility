# Native Chat Completions adapter

`createOpenRouterProvider()` implements the P01 native BYOK port using only P04.
Import and construction perform no I/O. Call `probe(context)` explicitly, then
`generate(context, input, observer)` on that same instance. A fresh, validated
catalog for the exact account and credential hash is required. Listing proves
metadata access only. This package adds no registry entry or activation.

Only exact `openai/gpt-5.2` is curated. Metadata must confirm text input/output,
the token control and a positive output limit. Temperature also requires metadata
support. Offline fixtures verify parsing and request construction; they are not
evidence of live compatibility or entitlement. Model variants, aliases and other
catalog entries are excluded. Add exact candidates through reviewed fixtures.

Requests use `stream: false`, `max_completion_tokens`, the validated, trimmed
prompt, and a language system message. Routing is pinned to `openai` with both `only` and `order`,
`allow_fallbacks: false` and `require_parameters: true`. Actual identities come
from response fields, including explicitly selected routing metadata, never from
the request or an unselected endpoint. Policy: unreported identity stays null;
routing is pinned by the request. When neither identity is reported, an otherwise
complete answer remains `completed`. Reported model/provider drift or multiple
attempts fail visibly with measured usage retained. Conflicting top-level and
selected provider labels, or labels P01 cannot represent (including spaces),
produce `failed/provider_error` with null actual provider and retained usage.
Malformed model IDs, multiple selected endpoints and credential echoes outside
citation titles still fail response validation; those rejected responses do not
retain measured usage.

Search is either off (`plugins: []`) or `[{ id: "web", engine: "exa", mode: "auto", max_results: 5 }]`.
Native and automatic engine selection differ from pinned Exa mode. Country hints,
`maxCalls`, custom engines/plugins, arbitrary tools and routing overrides are unsupported.
`max_results` limits results, not search calls, so it cannot implement `maxCalls`.
Unknown controls fail before P04 admission. Citation occurrences remain distinct;
an exact retained URL shares one source ID. Offsets are null because the docs do
not establish UTF-16 indexing. Citation titles with lone surrogates are dropped
to null and flagged as citation truncation. Valid titles retain at most 256
Unicode code points within P01's 512 UTF-16-unit bound. Answers retain up to
24 KiB of complete Unicode characters. Provider, application and citation
truncation are separate flags. The complete raw citation title is checked for a
credential echo before truncation or Unicode filtering, including echoes that
start beyond the retained title boundary. An echo drops that citation, flags
citation truncation and returns `failed/invalid_response` with answer/citations
removed, retaining measured usage and independently valid cost evidence. This
preserves the reviewed refusal policy without throwing after dispatch.
Failure text, bodies and headers are discarded; errors use P04's fixed messages.

Token totals retain cache/reasoning subsets without adding them twice. Absent
quantities remain null. Cache-write TTL, search-call counts and search-content
tokens are unreported here. Search usage remains partial. Metadata prices never
become observed charges or a complete local estimate. The catalog test's pricing
getter is explicitly enumerable and verified against spread and iteration.

## Exact money and scoped evidence

Generation opts into the shared bounded lossless JSON reader for exactly four
numeric fields: `usage.cost`, `usage.cost_details.upstream_inference_cost`,
`usage.cost_details.upstream_inference_prompt_cost` and
`usage.cost_details.upstream_inference_completions_cost`. The reader preserves
original decimal precision and expands exponents before normalization. Other
numbers, including token counts, retain their existing types and interpretation.
The catalog read does not opt in. Strings must satisfy `paymentDecimalSchema`
(`lib/action-payment/schema.ts`): `^(?:0|[1-9]\d*)(?:\.\d+)?$`, at most 2048
characters. Integer digits are canonical; fractional leading/trailing zeros and
variable scales are accepted. Missing, malformed or unprojected numeric money
remains unknown.

`costEvidence.providerReported` retains a reported amount with response provenance
and explicit scope. The official accounting guide calls `usage.cost` the total
charged to the account; the BYOK/pricing docs distinguish the separate inference
bill on the customer's upstream provider account. The response's optional
`usage.is_byok` is documented as whether the request used Bring Your Own Key.
Only **`is_byok === false` with search off**, without contradictory upstream
amounts, establishes a total here: it is copied into `providerCost`. If any
reported upstream total or component, or the exact sum of both present components,
exceeds the account charge, exact decimal comparison downgrades it to a
**subtotal**. Unless `is_byok === true`, nothing is included or excluded and all
six components (including inference) are unknown, with search on or off.
`providerCost` stays unknown; both evidence parts and the answer are retained.
This comparison precedes removal of inconsistent components, so dropping
evidence cannot restore a contradicted total.

With `is_byok === true`, the account charge is a **subtotal**, inference is
excluded, and all other components remain unknown. With a missing or malformed
indicator, it is a **subtotal** with every component (including inference)
unknown, even if no upstream amount was supplied. For searched requests the
amount remains a **subtotal** and `providerCost` remains unknown, including an
explicit zero; only uncontradicted explicit non-BYOK includes inference.
Web/plugin fee coverage is still **unverified**. No client-side sum becomes a
reported total.

Upstream inference total/input/output remain separate reported evidence, never
substituted for or added to the account charge. All amounts use USD, the
documented credit currency; no conversion is inferred. Missing evidence slots
and `localEstimate` remain null. Explicit zero remains reported evidence, not a
claim that unreported fees are zero.

The adapter validates evidence against shared currency and exact decimal bounds.
If an input or output amount exceeds a reported upstream total, only that
component becomes null before revalidation. The consistent total and sibling
component survive, even when both components must become null. A missing total
does not invalidate reported components. If no admissible evidence remains, or
the remaining breakdown still fails validation, `upstreamInference` is null.
The independent amount/scope, tokens and valid answer survive; `providerCost`
stays known only when the retained scope establishes a total. A consistency discard sets
`costEvidence.upstreamInferenceDiscardReason: "inconsistent"`, including when
only one component was nulled. Absence means no recorded consistency discard;
unreported upstream evidence alone does not set a reason.
Monetary uncertainty alone does not fail an answer (the plan's
section 3, "Monetary truth and metering", lines 118-120). Other response failures
remain failures. Missing totals/components are not zero. When both components
are present, common-scale integer arithmetic adds them only for comparison
against the account charge. The sum is never emitted or substituted into any
evidence field; a missing component leaves only the individual comparisons.

The [usage-accounting guide](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
in **Cost Breakdown** (accessed **2026-11-12**), describes upstream inference as
"The actual cost charged by the
upstream AI provider, split into" input and output costs, and maps those to
`upstream_inference_prompt_cost` and `upstream_inference_completions_cost` for
Chat Completions. This establishes them as separate parts of the upstream cost
and supports the comparison-only sum.

The [usage-accounting example](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
was re-read on **2026-11-12**. Its Responses example explicitly quotes
`"is_byok": false`, `"cost": 0.95`, `"upstream_inference_cost": null`,
`"upstream_inference_input_cost": 18` and `"upstream_inference_output_cost": 1`.
Its Chat Completions example also pairs `"cost": 0.95` with
`"upstream_inference_cost": 19`, without an `is_byok` indicator. These numbers
are not a coherent same-unit non-BYOK total. We treat them as an illustrative
example with inconsistent units, not a billing contract; this is our inference,
and the page supplies no conversion that reconciles them. The documented shape
is retained but cannot establish a total. The guide describes zero/null totals
for non-BYOK **generation-ID readback**, not inline Chat Completions. Zero or
rounded inline totals below their components remain **unverified**; their tests
are synthetic robustness cases.

## Remaining integration and readback boundary

The shared result extensions are enabled on this branch and reach the observer
through the bounded transport. This package makes no registry entry, persistence,
transport or activation change. Consulted-only source lists are not invented from
citation annotations.

Original-generation readback remains unimplemented. Credential-free documentation
was re-read on **2026-11-12**: the generation metadata reference and usage guide
confirm an authenticated ID-based GET, but establish neither free pricing nor
same-account access binding explicitly. No readback call was made. A future shared
fixed route must bind account/credential/original generation ID, query grammar,
deadline and bytes, and establish free classification. Pending/not-found evidence
must never replay generation. The current task does not add that route.

## Official sources and fixture provenance

Credential-free documentation accessed **2026-11-12, Europe/Warsaw**. Protocol:
OpenRouter HTTP API v1, Chat Completions, non-streaming; plugin `web` with explicit
engine `exa`. No SDK or real account/provider call was used.

| Source | Documentation-confirmed detail |
| --- | --- |
| [Chat reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) | `max_completion_tokens` is accepted; `max_tokens` is deprecated. Schema includes `attempt`, `attempts` and selected endpoint metadata. Routing metadata needs header opt-in, which this adapter does not request. |
| [Model reference](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) | Catalog examples include IDs, modalities, `supported_parameters: ["max_tokens", ...]`, string prices and `top_provider.max_completion_tokens`. |
| [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) | Provider allowlist/order, disabled fallbacks and required parameter support |
| [Web plugin](https://openrouter.ai/docs/guides/features/plugins/web-search) | Explicit Exa versus native/automatic search, annotations and separate search charges |
| [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) | Native token/cache/reasoning dimensions, account charge versus upstream inference total/input/output, and automatic usage |
| [BYOK](https://openrouter.ai/docs/guides/overview/auth/byok) and [Pricing](https://openrouter.ai/pricing) | Upstream provider bills inference directly; separate gateway fee |
| [API overview](https://openrouter.ai/docs/api/reference/overview) | Optional boolean `usage.is_byok` describes use of an upstream key |
| [Credit currency](https://openrouter.ai/support/) | Credits are denominated in USD |
| [Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation) | Authenticated ID-based metadata read; free pricing and same-account binding not established |

Documentation confirmation is separate from live compatibility. The following
remain **unverified**, and synthetic fixtures do not settle them:

- Equivalence between the catalog gate's `max_tokens` and the sent
  `max_completion_tokens` under `require_parameters: true`. Both names are
  documented separately; the inspected sources do not establish that routing
  treats them as equivalent. The request is unchanged pending that evidence.
- Whether this exact model returns a dated model slug. The response schema says
  which model was used but does not promise an exact alias-preserving value.
  Any different reported ID currently fails with retained usage.
- The exact top-level `provider` label for this route. `OpenAI` occurs in
  selected-endpoint examples; it does not prove this field is always emitted.
  No metadata opt-in means selected-endpoint/attempt evidence is not guaranteed.
- Whether empty `plugins` and `transforms` override all account-level defaults.
  Tests pin the sent arrays; they do not prove server interpretation.
- Whether `usage.cost` includes Exa plugin fees; subtotal scope preserves this
  uncertainty without losing the reported amount.
- Whether ordinary inline Chat Completions responses always include
  `usage.is_byok`. Check a live call before activation. If the indicator is
  absent on every request, `providerCost` stays unknown on every request.
- Live compatibility, entitlement, billing completeness, original-generation
  readback availability and its free/same-account classification. No account or
  provider request was made.

All fixture values are **synthetic**, with documentation-derived envelopes.
There are no live captures. `__fixtures__/provenance.json` inventories files and
test-generated negatives. `answer.json` uses numeric wire costs. New transport
tests construct raw numeric JSON with precision beyond double precision, exponent
underflow and explicit zero, while normalizer tests use synthetic post-parser
strings. Neither is a live charge. `catalog.json` prices are synthetic, not a
vendor rate card. `search.json` assumes the explicit Exa request constructed in
tests; generic annotations alone do not identify an engine. Synthetic canaries
are generated test data, never credentials. The answer fixture explicitly declares
non-BYOK; negative fixtures remove or corrupt that indicator. Wire helpers build
one usage object with unique keys before replacing one synthetic numeric token.

Validation: regressions fail against the old implementation and pass with these
changes; independent old-code mutations cover lossless opt-in, evidence delivery,
search scope/total, component consistency, raw title checks and the enumerable
pricing guard. Scoped TypeScript includes every owned production and test file.
Only focused unit tests and touched-file quality gates run here; global typecheck,
full suite, build, public snapshot and live acceptance remain coordinator work.

### Search configuration review, 2026-11-17

The request pins Exa Auto and five results instead of depending on service defaults.
The published Exa Auto fee is USD 0.007 per request including up to ten results,
plus model tokens for the returned search content. This is a pricing reference,
not evidence of a completed paid request or exact per-generation charge.
Source: https://openrouter.ai/docs/guides/features/plugins/web-search#pricing
