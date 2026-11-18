# Native gateway text adapter

Offline implementation of the native BYOK ModelProvider port. The caller supplies
the user's gateway API key in memory. Only explicit `probe` and `generate` invoke
the shared bounded transport. There is no credential lookup, OIDC, custom URL,
client tool execution, SDK, retry, fallback request or generation lookup.

The route is the raw Chat Completions API, never a consumer-product capture.
Requested identity stays in `column.modelId`; `actualModelId` comes from response
`model`, and `actualProviderId` only from
`choices[0].message.provider_metadata.gateway.routing.finalProvider`.
Missing upstream identity stays null. Contradictory model metadata produces a
partial result with `unsupported_model`; it never becomes a successful substitute.
When `routing.finalProvider` is present, a successful provider attempt must agree
with it. A conflicting or unsafe final identity, or multiple successful provider
attempts in one model attempt, produces the existing partial `invalid_response`
outcome for an otherwise valid answer and unknown cost; the reported final identity
is not replaced by a guess.
Gateway-side provider failover remains gateway behavior; one transport POST does
not prove one gateway-internal provider attempt.

## Capabilities and limitations

- Curated exact model: `anthropic/claude-sonnet-5`. Intersect the explicit metadata
  list with the synthetic fixture-backed capability; other IDs, virtual models and
  non-text modalities are excluded. Actual support for this exact route remains
  UNVERIFIED. The static output ceiling is 4096 tokens. `probe` reduces the returned
  catalog entry to a lower `max_tokens`, but `generate` receives no catalog and
  retains no probe state. P12 must bind a fresh server-owned catalog and call
  `createModelPlaygroundRunSchema` before dispatch. That launch-time validator is
  the binding effective-model-limit check: a catalog limit of 64 must reject a
  request for 128 even though the adapter's static ceiling permits it. Calling
  `generate` alone does not enforce a previously probed limit. No cache is added.
- Temperature is disabled: endpoint-level parameter documentation does not prove
  acceptance by this exact model/route. Reasoning, cache controls, routing controls other than eligibility,
  upstream tools and arbitrary request fields are not accepted by the port.
- All search modes, country hints and call limits are rejected before admission.
  The documented REST request uses `tools: [{type: 'vercel:perplexity_search',
  config: {query, max_results}}]`; config keys use snake case. `max_results` is
  a result count, not a call limit. The SDK documents `country`, but this package
  has no exact-route REST country, hard call-limit or final citation fixture.
- The docs identify `message.provider_metadata.gateway.gatewayToolCalls` but its
  count schema and presence on ordinary text responses are UNVERIFIED.
  Unexpected server-tool metadata, even an empty object, produces a partial
  invalid response; count/content dimensions remain null. No synthetic count
  shape is promoted to verified search capability.
- Standard URL annotations are retained defensively, with canonical URL identity,
  distinct occurrences and bounds. This is compatibility parsing, not evidence
  of Perplexity citations. The gateway annotation shape and Unicode offset units
  are UNVERIFIED; only unambiguous ASCII offsets are retained. Invalid/lost
  annotation data marks truncation. Citation titles are checked before truncation:
  lone surrogates or key echoes discard the title and mark citation truncation while
  retaining the safe URL, answer and measured usage; valid surrogate pairs survive.
  A null answer retains no citations; discarded annotations mark citation truncation
  without losing the refusal or its usage and cost evidence.
- Answers retain their full 24 KiB budget without splitting code points. Provider
  length stops and application/citation truncation are explicit. Errors retain
  fixed categories only. Response text containing the supplied key is rejected.

## Accounting and integration prerequisites

Token totals and explicit reasoning/cache subsets are retained without summing
subsets twice. Missing values remain null. Cache inclusion versus additional
accounting is UNVERIFIED on routed vendors, including the selected route, so
`inputCacheAccounting` is always `unknown`, even when both cache fields are absent
or their sum fits inside the input total. The compatible cache/reasoning field
shapes are also UNVERIFIED for this exact route. Usage stays partial because cache
TTL, server-tool counts and route-specific billing coverage are not established.

The decimal string `message.provider_metadata.gateway.cost` becomes reported USD
with `basis: provider_response` only with nonempty, consistent attempt evidence
where every successful provider attempt explicitly has `credentialType: "system"`.
The routing documentation demonstrates that literal and the BYOK documentation
states that system fallback consumes gateway credits. Its documented cost meaning
is an inference/tool subtotal excluding surcharges. This supports the conservative
system-only rule; the combined metadata shape on this exact REST route is still
UNVERIFIED. An explicit `"0"` with verified system attempts is a reported subtotal,
never a free request or complete bill. BYOK, missing, unknown or mixed successful
credential types produce null amount and unknown certainty/basis, including when
cost is `"0"`. Explicitly failed attempts do not establish a successful charge.
The exact cost value/coverage returned for BYOK credentials is UNVERIFIED and must
not stand in for the upstream vendor bill. Numeric, missing or invalid cost values
remain unknown. `marketCost`, catalog prices and upstream rates never become actual
charges or estimates.

`costEvidence.providerReported` carries that same exact USD amount and
`scope.kind: "subtotal"`. Its scope includes `inference` and `tools`, excludes
`reporting_writes` and `zero_data_retention`, and leaves `routing` and `other`
unknown. Legacy `providerCost` retains the same reported subtotal for compatibility;
its field name never makes it a total. No upstream split or estimate is invented:
`upstreamInference` and `localEstimate` are null. When the billing or routing evidence
is invalid, `providerCost` is unknown and all three cost-evidence slots are null.
A model marked successful with only failed provider attempts, or a provider attempt
without an explicit success flag, is insufficient billing evidence.

`routingAttemptCredentials` version 1 retains the supplied provider attempts from
each model attempt, including failures, in order. Each entry has only `outcome`
(`succeeded`, `failed`, `unknown`) and `credentialSource` (`gateway_system`,
`customer_upstream`, `unknown`); only literal `system` and `byok` map to the
known sources. No provider text or credential value is retained. The list is
bounded at 100. Every array-valued `modelAttempts` tree sets `completeness: partial`,
including consistent, empty, malformed, contradictory or truncated trees. Missing
or non-array `modelAttempts` (including null or an object) sets `unknown`. Unknown
credential values remain unknown. The official routing docs describe error detail
in `providerAttempts`, but do not guarantee that metadata lists every provider
attempt, including earlier retries and attempts using the customer's upstream key.
Exhaustive request coverage remains UNVERIFIED; tree consistency cannot establish it.

Failed non-system attempts can leave additional upstream-key charges even when a
system attempt succeeds. Receipt version `model-native-v2` reports no additional
exposure only for a complete list whose every entry is `gateway_system`. This
adapter never emits a complete list, so its additional exposure stays unknown. Partial,
unknown, missing or customer-key evidence keeps exposure unknown. Old v1 receipts
retain their original derivation. This does not turn the subtotal into a total,
complete partial usage, or authorize a retry. Native gateway metadata/tool evidence
and verified tool-count shape still need follow-up. `paymentReceipt` and
`rawEvidenceId` remain null until their owning integration supplies durable evidence.

The fixed metadata route is public even when a key is attached. `catalog_available`
proves catalog parsing only, not authentication, team eligibility or generation
entitlement. Authenticated `?include_availability` requires an approved shared
transport extension; this package cannot add it. A returned 401 is `invalid_key`.

Integration must register the adapter without activation, bind a fresh server-owned
catalog/credential revision at launch, use the strict catalog-bound P01 validator,
and supply P09 durable admission/settlement and its persistence timeout. P12 owns
account/connection checks. No provider, account, charge or production behavior has
been tested live, and this package alone is not user-runnable.

## Official evidence register

Re-read 2026-11-12 (Europe/Warsaw), credential-free documentation only. Protocol:
HTTP `/v1` Chat Completions and `GET /v1/models`. No SDK is installed or used.
The external scratch evidence register records documentation findings and retrieval hashes.
These mutable documents are not live API captures or account attestations.

| Source | Documentation establishes | Remaining UNVERIFIED assumption |
| --- | --- | --- |
| [Completion requests](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions) | Bearer endpoint, non-streaming envelope, `max_tokens`; example response uses a slash-qualified `body.model` | Exact response model identity for the selected route, dated/upstream IDs and all routed vendors; parameter support beyond the documented example |
| [REST metadata](https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api) | Public model list, `max_tokens` means maximum output tokens, authenticated eligibility is separate | Actual account eligibility, curated model availability, and whether the public route returns 401 for a bad key |
| [Provider routing](https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering) | SDK routing object, successful `system` and failed `byok` examples, decimal inference/tool cost excluding surcharges | Identical routing/cost placement and shape in this route's Chat Completions message; cost coverage for other credential types |
| [BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok) | Upstream credentials and gateway credentials differ; system fallback uses gateway credits; own-key spend is separate | Exact returned cost under upstream BYOK and its upstream bill; unrecognized credential type semantics |
| [Web search](https://vercel.com/docs/ai-gateway/models-and-providers/web-search) | REST server tools and metadata path `choices[0].message.provider_metadata.gateway.gatewayToolCalls` | Tool count object shape, presence on plain text responses, citation shape, Unicode offsets and exact-route search capability |
| [Caching](https://vercel.com/docs/ai-gateway/models-and-providers/automatic-caching) | Provider-specific caching guidance | Mapping of routed cache counters into `prompt_tokens`; inclusion/additional semantics, TTL and exact field support |

The gateway web-search documentation places metadata on the Chat Completions
message. Applying the separately documented gateway routing/cost object at that
location is an UNVERIFIED combination of separate documentation examples, tested
synthetically. Unknown alternate locations are ignored rather than guessed.
The `system`-only cost rule does not verify that combined wire placement. No
assumption above is promoted to live verification by a passing fixture test.

## Fixture register

Revision: `gateway-synthetic-text-v1` plus correction and contract-adoption regressions.
All response fixtures and inline negatives are synthetic. None is a live capture. Identifiers,
counts, money, answer text and
example.org source URLs are artificial; no account data or credentials were read.

| Fixture | Exact model | Provenance |
| --- | --- | --- |
| `catalog.json` | `anthropic/claude-sonnet-5`, `unverified/text-model`, `synthetic/image-only` | Synthetic catalog based on documented metadata shape; no live discovery |
| `text.json` | `anthropic/claude-sonnet-5` | Synthetic response adapted from completion example; original example uses `anthropic/claude-opus-5` |
| `routed.json` | `anthropic/claude-sonnet-5` | Synthetic combination of routing/cost docs and compatible usage fields; precision and routed provider are test cases |
| `error.json` | Not applicable | Synthetic documented error wrapper with secret/prompt echo canaries |
| `unverified-search.json` | `anthropic/claude-sonnet-5` | Documentation-derived request shape with synthetic query; deliberately not an enabled capability |
| Inline test variants | Curated ID unless explicit drift/unsupported negative | Synthetic malformed/status/usage/money/routing/citation/cancellation fixtures |

Documentation findings, retrieval hashes, fixture provenance, gate logs and
self-review are retained in the task's external scratch run directory. Tests
replace transport or fetch and fail on unexpected network.


## Provider eligibility, 2026-11-12

[Filtering reference](https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering)
shows a raw `POST /v1/chat/completions` with
`providerOptions: { gateway: { only: ["bedrock", "anthropic"] } }`.
`settings.allowedProviders` is optional; omission leaves gateway choice. An
explicit set must have 1..16 unique canonical slugs from the reviewed
[provider table](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options#available-providers).
This set may fail over internally, but no application retry removes or relaxes
it. No `order`, model fallback, credential constraint or charge guarantee is added.
An unavailable set produces a normal typed provider failure.

A returned final provider outside the set adds the enum-only
`routingViolation: provider_outside_allowed_set` while retaining the answer,
usage and cost evidence. Missing final identity stays null and cannot prove a
violation or compliance. Attempt completeness remains partial/unknown as above.
Raw response-placement uncertainty is unchanged. Every eligibility fixture value
is synthetic, shaped by the reference; no live enforcement is claimed.
