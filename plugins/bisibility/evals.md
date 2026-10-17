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

Behavioral evaluation (mock tools only): use the example report as a shape guide and supply a partial crawl, a failed page, stale rankings, an observed AI report with an unknown observation date, and a synthetic answer citing the brand. Require a saved external `seo_audit` payload with truthful uncertainty and no paid calls. Repeat with a viewer/read-only key: analysis may continue but crawl/save must be reported as blocked, without credential or project switching.

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

> Review retained AI tracking answers for example.com and recommend up to three changes to earn mentions or citations. Do not buy fresh data.

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

## Passing condition

Each positive case invokes only its named Bisibility skill. Each negative case invokes no Bisibility skill except the explicitly named cross-routing case. Record the Claude Code version, model, and result when performing a release check because model routing is probabilistic.
