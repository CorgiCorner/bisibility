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

## Passing condition

Each positive case invokes only its named Bisibility skill. Each negative case invokes no Bisibility skill except the explicitly named cross-routing case. Record the Claude Code version, model, and result when performing a release check because model routing is probabilistic.
