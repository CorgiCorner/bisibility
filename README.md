# bisibility

> Own your search visibility data.

bisibility is an open-source SEO platform for researching keywords, inspecting
backlinks, and tracking Google rankings - in a PostgreSQL database you own.
Self-host it or start with the hosted beta.

[![CI](https://github.com/CorgiCorner/bisibility/actions/workflows/ci.yml/badge.svg)](https://github.com/CorgiCorner/bisibility/actions/workflows/ci.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[Self-hosting guide](https://bisibility.com/docs/self-hosting) ·
[Documentation](https://bisibility.com/docs) ·
[API reference](https://bisibility.com/docs/api/overview) ·
[FAQ](https://bisibility.com/faq) ·
[Roadmap](https://bisibility.com/roadmap)

![bisibility dashboard](public/screenshots/dashboard-overview.png)

*Dashboard running with demo data.*

bisibility is an early release: everything below can be tested today, but expect
rough edges and breaking changes before 1.0. Please report installation problems,
bugs, and workflow feedback through
[GitHub Issues](https://github.com/CorgiCorner/bisibility/issues).

## Why bisibility?

- **Research before you track.** Explore keyword opportunities and backlink data,
  then use the findings to decide what belongs in a tracked project.
- **Own the history.** Positions, ranking URLs, timestamps, and per-check provider
  cost data live in a PostgreSQL database you operate, with direct SQL access and
  full-history export.
- **One model instead of raw provider APIs.** Rank results from DataForSEO and
  SerpAPI are normalized behind a single application model with per-keyword
  schedules, alert rules, and stored SERP snapshots when you self-host.
- **Connect the context.** Compare Share of Voice, add opt-in Search Console and
  GA4 metrics, and line ranking movement up with deploy and CMS signals.
- **Operate as a team.** Owner, Admin, Editor, and Viewer roles, an audit log, and
  signed outbound webhooks.
- **Inspect the system.** The dashboard, scheduler, provider adapters, and delivery
  pipeline are open source under AGPL-3.0.

bisibility stays focused on search visibility workflows. It is not a general-purpose
technical site-audit, content-writing, or on-page optimization suite.

For rank checks, connect your own DataForSEO or SerpAPI account. Self-hosted
deployments keep provider credentials in your instance; the hosted beta stores them
encrypted in the managed service. Billing remains directly between you and the provider.

## Try the local demo

```bash
git clone https://github.com/CorgiCorner/bisibility.git bisibility
cd bisibility
./scripts/dev/bootstrap-local.sh
docker compose -f compose.yaml up -d
```

Open [http://localhost:3000](http://localhost:3000) and sign in with email
`demo@acme.dev` and OTP `000000`. Compose pulls version-pinned images by default;
add `-f compose.build.yaml --build` to build the checked-out source instead.

> [!WARNING]
> Demo authentication is intentionally insecure and is meant for a throwaway local
> installation only. Remove both `DEMO_*` variables and configure an email provider
> (`EMAIL_PROVIDER` with [Resend or Amazon SES](https://bisibility.com/docs/guides/email))
> before exposing an instance to other users or real data.

The default stack runs manual rank checks only. For recurring schedules, add the
worker and bundled Temporal overlays (`--profile temporal-ui` serves the Temporal
Web UI at [http://localhost:8233](http://localhost:8233)):

```bash
docker compose -f compose.yaml -f compose.worker.yaml -f compose.temporal.yaml up -d
```

## Features

- Keyword research: related queries, suggestions, ideas, search volume, 12-month
  trends, CPC, competition, difficulty, and intent data
- Backlink research: referring domains and pages, 12-month new and lost link
  history, authority and spam metrics, and link attributes
- Rank tracking: position history, trend charts, intended URL monitoring, and
  Google index status
- Competitor benchmarking with Share of Voice
- Manual, daily, weekly, monthly, and custom cron schedules
- Rank alerts in-app and by email, plus weekly email digests
- Keyword tags and saved views
- Opt-in Search Console (queries, clicks, impressions) and GA4 (landing-page
  sessions, engagement, key events) connections
- A signal timeline for rank checks, deploys, CMS events, and manual notes
- REST API v1 with OpenAPI, an MCP endpoint, signed outbound webhooks, CSV export,
  a CLI, and TypeScript, Python, and Go SDKs
- Owner, Admin, Editor, and Viewer team roles, with an audit log

Everything above ships in the current early release; none of it is a stable 1.0
contract yet. The hosted service is in open beta, and a domain overview is planned.
Slack alert delivery, AI Overview and LLM visibility tracking, and hosted general
availability are tracked on the [roadmap](https://bisibility.com/roadmap).

## AI agents and MCP

bisibility is API-first. Agents work with the same projects, keywords, checks,
alerts, and history that power the dashboard: the REST API, the OpenAPI schema, and
the MCP endpoint converge on the same application model, so agent behavior does not
rely on dashboard scraping.

For example, connect Codex to a self-hosted instance with a personal access token:

```bash
export BISIBILITY_TOKEN="bsb_pat_live_..."
codex mcp add bisibility \
  --url "https://your-host.example/api/mcp" \
  --bearer-token-env-var BISIBILITY_TOKEN
```

Project API keys work too. Other clients use different configuration fields, but the
HTTP connection uses the `/api/mcp` Streamable HTTP endpoint and an
`Authorization: Bearer <token>` header. The endpoint advertises its tool inventory
through the [MCP server card](https://bisibility.com/.well-known/mcp/server-card.json);
tool names and schemas may change before 1.0. The built-in endpoint and the
separately installed `@bisibility/mcp` package expose the same unprefixed
`snake_case` tools.

See the [agent documentation](https://bisibility.com/docs/agents) for worked
examples, cost-approval guidance, and the CLI and SDKs.

## Provider support

| Capability | DataForSEO | SerpAPI |
| --- | ---: | ---: |
| Google rank checks | Available | Available |
| Keyword research | Available | Not supported |
| Backlink research | Available | Not supported |
| Stored normalized SERP snapshot (self-hosted) | Available | Available |
| Rank-check cost record | Provider reported | Configured or estimated |

## Self-hosting in production

Production deployments need PostgreSQL, Valkey or another Redis-compatible endpoint,
and a supported SERP provider account. Scheduled checks additionally require the
Temporal worker. Read the
[self-hosting guide](https://bisibility.com/docs/self-hosting) before serving real
traffic.

## Cost model

Self-hosted bisibility has no application subscription and no per-keyword license
fee. You pay separately for the infrastructure you run, SERP requests made through
your own provider account, and optional third-party services such as email delivery.
bisibility does not resell SERP data. Completed checks store provider-reported cost
when available and keep configured or model-based estimates separately. Use the
[rank-tracking cost calculator](https://bisibility.com/rank-tracking-cost-calculator)
before enabling a large schedule.

## Architecture

- Next.js serves the dashboard and the REST API.
- PostgreSQL is the durable source of truth.
- Valkey ships by default; any Redis-compatible endpoint can hold shared runtime state.
- Temporal runs recurring rank checks; manual and scheduled checks share the same
  runner and persistence model.
- SERP and analytics providers are pluggable adapters.

## Hosted

The [hosted beta](https://bisibility.com/) runs the same core application without
requiring you to operate PostgreSQL, Valkey, or the Temporal worker. It is free
during the open beta and does not require a payment method; provider usage is billed
directly to your connected provider account. Hosted pricing will be announced before
the beta ends, and nothing will be charged without explicit confirmation.
Self-hosting remains available without an application subscription.

## Documentation

- [Self-hosting guide](https://bisibility.com/docs/self-hosting)
- [API quickstart](https://bisibility.com/docs/quickstart)
- [API reference](https://bisibility.com/docs/api/overview)
- [Agent documentation](https://bisibility.com/docs/agents)
- [FAQ](https://bisibility.com/faq)

## Contributing

Public issues and feature requests are welcome. This repository does not
accept pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

Do not report vulnerabilities through public issues. See [SECURITY.md](SECURITY.md)
for responsible disclosure.

## License

The Bisibility application and repository content are licensed under
`AGPL-3.0-only`. See [LICENSE](LICENSE).

The Claude Code plugin under [`plugins/bisibility/`](plugins/bisibility/) is
licensed separately under the [MIT License](plugins/bisibility/LICENSE). This
exception covers that directory and all content beneath it.

You may use, modify, and self-host bisibility. If you modify it and let users interact
with that version over a network, the license requires you to offer those users the
corresponding source code.

The license text governs. This summary is not legal advice.
