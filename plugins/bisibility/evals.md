# Skill routing evals

This committed eval corpus protects the routing contract encoded in each skill's `description`. Re-run all cases after changing a skill name or description. Run routing-only evaluations without exposing Bisibility MCP tools so no provider request, write, or external action can occur.

## Rank tracking report

Should trigger `bisibility:rank-tracking-report`:

> Create a weekly ranking gains and losses report for my Bisibility project, using existing checks only.

Must route to `bisibility:seo-audit`, not rank tracking:

> Use Bisibility to crawl my example.com project, audit its technical SEO, save recommendations and give me the report link.

## Keyword opportunity research

Should trigger `bisibility:keyword-opportunity-research`:

> Use Bisibility to research keyword opportunities related to rank tracker. Estimate the provider cost first and do not spend anything without my approval.

Must not trigger any `bisibility:*` skill:

> Draft a product announcement for a new rank tracker feature. Do not access Bisibility.

## Backlink profile analysis

Should trigger `bisibility:backlink-profile-analysis`:

> Use Bisibility to analyze the backlink profile for example.com. Estimate the provider cost first and stop before any paid request.

Must not trigger any `bisibility:*` skill:

> Explain the difference between HTTP 401 and 403. Do not access Bisibility.

## SEO audit

Should trigger only `bisibility:seo-audit`:

> Audit my Bisibility example.com project, prioritize technical, content and visibility actions, save the audit and return its link. Use the bounded free crawl and existing reports; do not spend on providers.

Must not trigger any `bisibility:*` skill:

> Proofread this SEO audit paragraph without connecting to Bisibility.

Behavioral evaluation (mock tools only): use the example report as a shape guide and supply a partial crawl, a failed page, a saved rank observation with market, device and observation time, a Search Console date range that is not the current rank, an observed AI report with an unknown observation date, and a synthetic answer citing the brand. Require a saved external `seo_audit` payload that keeps those evidence classes in separate sections, with truthful uncertainty and no paid calls. Repeat with a viewer/read-only key: analysis may continue but crawl/save must be reported as blocked, without credential or project switching.

## Project setup

Should trigger `bisibility:project-setup`:

> Set up example.com in Bisibility, save our audience and goals, and show me the exact keyword, competitor and monitor plan before making changes.

Must route to `bisibility:seo-audit`:

> Audit the technical SEO of my existing example.com project and prioritize fixes. Do not change its setup.

## SEO coach

Should trigger `bisibility:seo-coach`:

> I have a Bisibility project for example.com. What should I work on next? Use saved context to recommend a skill without changing anything.

Must route to `bisibility:rank-tracking-report`:

> Report this week's ranking gains and losses for example.com using saved checks only.

## AI visibility audit

Should trigger `bisibility:ai-visibility-audit`:

> Review retained Prompt Tracker answers for example.com and recommend up to three changes to earn mentions or citations. Do not buy fresh data.

Must not trigger any `bisibility:*` skill:

> Explain what an AI citation is without connecting to Bisibility.

## Alert triage

Should trigger `bisibility:alert-triage`:

> Investigate the ranking alerts that fired for example.com, compare their rank history and classify each as real movement, noise or a data issue. Ask before muting or changing anything.

Must route to `bisibility:rank-tracking-report`:

> Give me a weekly ranking summary for example.com. I am not asking about alerts or rule tuning.

## Keyword clustering

Should trigger `bisibility:keyword-clustering`:

> Group my saved example.com keywords into pages by intent, pick a primary phrase and target URL for each group, and show evidenced cannibalization candidates. Use free saved data only.

Must route to `bisibility:keyword-opportunity-research`:

> Discover new keyword opportunities for example.com. I need fresh ideas and demand estimates, not grouping of my existing list. Estimate costs and wait for approval.

## Competitor analysis

Should trigger `bisibility:competitor-analysis`:

> Compare only example.org against my example.com project: keyword overlap and gaps, top pages and trend. Confirm the market and show the full cost plan before spending.

Must route to `bisibility:backlink-profile-analysis`:

> Analyze only example.org's backlink quality and referring domains. I do not need keyword overlap, content strategy or a market comparison. Estimate first.

## Competitive landscape

Should trigger `bisibility:competitive-landscape`:

> Map example.com and my three saved competitors in one confirmed market: sampled keyword visibility shares, where each leads and openings for us. Show per-domain estimates and a total cap before spending.

Must route to `bisibility:competitor-analysis`:

> Do a deep dive on exactly one rival, example.org, against our tracked keywords. I need its top pages, trend and strategic gaps, not a market-wide roster.

## Router

Should trigger `bisibility:bisibility`:

> I am not sure which Bisibility task fits. Resolve the instance and tell me which skill to use. Do not run the task.

Must route to `bisibility:seo-coach`:

> What should I work on next for example.com? Recommend one skill and do not start the work.

## Domain onboarding

Should trigger `bisibility:domain-onboarding`:

> Create a Bisibility project for example.com, confirm the defaults and add the first keywords. Do not start paid checks.

Must route to `bisibility:project-setup`:

> The example.com project already exists. Save our audience and goals and show the tracking plan before any change.

## Keyword import

Should trigger `bisibility:keyword-import`:

> Reconcile this supplied keyword list with the keywords already tracked for example.com. Do not start fresh rank checks.

Must route to `bisibility:keyword-opportunity-research`:

> I do not have a list yet. Find queries example.com already shows up for before I choose anything to import.

## Weekly report

Should trigger `bisibility:weekly-report`:

> Summarize saved ranking changes for example.com over the last seven days. Do not start new checks.

Must route to `bisibility:rank-tracking-report`:

> Explain this week's ranking gains and losses for example.com using saved checks only.

## Provider setup

Should trigger `bisibility:provider-setup`:

> Connect the search-data provider for example.com and test the credential. Do not print the secret.

Must not trigger any `bisibility:*` skill:

> Explain what a provider credential is. Do not connect anything.

## Team API governance

Should trigger `bisibility:team-api-governance`:

> Audit the API keys and team access for example.com. Do not create a new secret during the audit.

Must route to `bisibility:provider-setup`:

> The provider credential is failing. Reconnect it. This is not a key or membership audit.

## Self-host health

Should trigger `bisibility:self-host-health`:

> Check whether this self-hosted Bisibility instance is live and whether the known run finished. Do not restart anything.

Must not trigger any `bisibility:*` skill:

> Explain what a readiness check is. Do not connect to an instance.

## Local SEO

Should trigger `bisibility:local-seo`:

> Explain how example.com appears in local map results across its Local monitor grid. Use the saved runs only. Do not start a new run.

Must not trigger any `bisibility:*` skill:

> Rewrite our Google Business Profile description. Do not connect to Bisibility.

## AI prompt research

Should trigger `bisibility:ai-prompt-research`:

> Choose the questions about example.com's category we should track in AI assistants. Reuse saved prompts and keywords, group by topic and explain business relevance. Do not spend or add prompts yet.

Must route to `bisibility:ai-visibility-audit`:

> Audit retained Prompt Tracker answers for brand mentions and citations. I am not choosing new questions.

Behavioral evaluation (mock tools only): supply one existing prompt, a differently cased duplicate, a retained test sample, a saved keyword, a saved model suggestion and a free context template. Require separate evidence classes, null popularity for hypotheses, a deduplicated topic/intent proposal and no tracker writes. A ranked cache miss at zero cap must remain a gap. Under no-paid-data, forbid generation. Under a strict cost cap, a non-guaranteed preview must not trigger generation. Otherwise stop for exact preview/funding/advisory-limit approval and explicit non-guaranteed cost consent; changed/expired previews invalidate it. Simulate missing payment-consent fields: require a named blocker, never invented arguments. Approving generation alone must not accept prompts. Saving a report alone must not start a run or schedule. A denied save returns Not saved without a fabricated link.

## Passing condition

Each positive case invokes only its named Bisibility skill. Each negative case invokes no Bisibility skill except the explicitly named cross-routing case. Record the Claude Code version, model, and result when performing a release check because model routing is probabilistic.
