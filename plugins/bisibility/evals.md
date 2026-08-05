# Skill routing evals

This committed eval corpus protects the routing contract encoded in each skill's `description`. Re-run all cases after changing a skill name or description. Run routing-only evaluations without exposing Bisibility MCP tools so no provider request, write, or external action can occur.

## Rank tracking report

Should trigger `bisibility:rank-tracking-report`:

> Create a weekly ranking gains and losses report for my Bisibility project, using existing checks only.

Must not trigger any `bisibility:*` skill:

> Crawl example.com and audit its robots directives, canonical tags, metadata, and internal links.

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

## Passing condition

Each positive case invokes only its named Bisibility skill. Each negative case invokes no Bisibility skill. Record the Claude Code version, model, and result when performing a release check because model routing is probabilistic.
