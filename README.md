# bisibility

<p>
  <img src="public/brand/readme-banner.svg" width="900" alt="bisibility - Your personal SEO dashboard" />
</p>

[![Site](https://img.shields.io/badge/site-bisibility.com-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com)
[![Live demo](https://img.shields.io/badge/demo-explore-1f6c40?style=flat&labelColor=1a3b2a)](https://demo.bisibility.com)
[![Documentation](https://img.shields.io/badge/docs-read-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs)
[![X: bisibility_com](https://img.shields.io/badge/X-%40bisibility__com-1f6c40?style=flat&labelColor=1a3b2a&logo=x&logoColor=white)](https://x.com/bisibility_com)
[![X: msniezynski](https://img.shields.io/badge/X-%40msniezynski-1f6c40?style=flat&labelColor=1a3b2a&logo=x&logoColor=white)](https://x.com/msniezynski)

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-1f6c40?style=flat&labelColor=1a3b2a)](LICENSE)
[![Latest public release](https://img.shields.io/github/v/release/CorgiCorner/bisibility?style=flat&label=release&labelColor=1a3b2a&color=1f6c40)](https://github.com/CorgiCorner/bisibility/releases/latest)
[![CI gate](https://img.shields.io/github/check-runs/CorgiCorner/bisibility/main?nameFilter=ci-ok&label=CI%20gate)](https://github.com/CorgiCorner/bisibility/actions/workflows/ci.yml)
[![Security policy](https://img.shields.io/badge/security-policy-1f6c40?style=flat&labelColor=1a3b2a)](.github/SECURITY.md)
[![Docker deployment guide](https://img.shields.io/badge/Docker-deploy-1f6c40?style=flat&labelColor=1a3b2a&logo=docker&logoColor=white)](https://bisibility.com/docs/self-hosting/docker)

[![Self-hosting guide](https://img.shields.io/badge/self--hosted-your%20data-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs/self-hosting)
[![Bring your own provider keys](https://img.shields.io/badge/BYOK-your%20providers-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs/integrations)
[![REST API with OpenAPI](https://img.shields.io/badge/REST-OpenAPI-1f6c40?style=flat&labelColor=1a3b2a&logo=openapiinitiative&logoColor=white)](https://bisibility.com/docs/api/overview)
[![MCP and agent guide](https://img.shields.io/badge/MCP-agent%20guide-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs/agents)
[![CLI documentation](https://img.shields.io/badge/CLI-reference-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs/cli)

[![TypeScript SDK](https://img.shields.io/badge/SDK-TypeScript-1f6c40?style=flat&labelColor=1a3b2a&logo=typescript&logoColor=white)](https://bisibility.com/docs/sdks/typescript)
[![Python SDK](https://img.shields.io/badge/SDK-Python-1f6c40?style=flat&labelColor=1a3b2a&logo=python&logoColor=white)](https://bisibility.com/docs/sdks/python)
[![Go SDK](https://img.shields.io/badge/SDK-Go-1f6c40?style=flat&labelColor=1a3b2a&logo=go&logoColor=white)](https://bisibility.com/docs/sdks/go)
[![Signed webhooks](https://img.shields.io/badge/webhooks-signed-1f6c40?style=flat&labelColor=1a3b2a)](https://bisibility.com/docs/api/webhooks)

**An open-source SEO dashboard, available hosted or self-hosted.**

Track Google rankings, research keywords, review backlinks, and monitor
AI answers over time. Work through the dashboard, scripts, or AI agents.
Use your own provider accounts, or use credits on the hosted service.

**[Explore the demo](https://demo.bisibility.com)** ·
[Get started](#get-started) ·
[Documentation](https://bisibility.com/docs)

## Features

- **Rank tracking:** Track positions by market and device, schedule checks,
  review ranking history, and receive alerts. Compare competitors with
  Share of Voice.
- **Keyword research:** Discover keyword ideas and compare search volume,
  difficulty, trends, and intent.
- **Backlinks:** Explore referring domains, new and lost links.
- Domain overview: organic visibility, ranked keywords, and top pages; requires a
  bring-your-own DataForSEO connection; metered. The app and REST API are available.
  See [released client support](https://bisibility.com/docs/compatibility).
- **AI Tracking:** Repeat selected prompts and compare saved answers
  and citations from supported sources over time.
- **Site Audit:** Check a small sample of pages for HTTP errors
  and on-page SEO issues.
- **Search Console and GA4:** See search performance and organic traffic
  alongside your ranking data.

[![bisibility dashboard with synthetic ranking history](public/screenshots/dashboard-overview.png)](public/screenshots/dashboard-overview-full.png)

*Local instance with synthetic data. Click the image to view the full dashboard.*

## Get started

Try the [online demo](https://demo.bisibility.com), then choose how to use
bisibility:

- **[Hosted service](https://bisibility.com/docs/hosted-quickstart):**
  Use the paid service without managing infrastructure. Bring your own
  provider accounts or use credits for supported operations.
- **[Self-hosted](https://bisibility.com/docs/self-hosting):**
  Run it on your own infrastructure and database.

See [deployment options](https://bisibility.com/docs/deployment-options)
for hosted limits and infrastructure requirements. Self-hosted scheduling
also requires the worker and Temporal.

### Try locally

Requires Git, Docker with Compose, and OpenSSL. The local demo includes
synthetic data and needs no provider account.

```bash
git clone https://github.com/CorgiCorner/bisibility.git bisibility
cd bisibility
./scripts/dev/bootstrap-local.sh
docker compose -f compose.yaml up -d
```

Open [localhost:3000](http://localhost:3000) and sign in with
`demo@acme.dev` and code `000000`.

Keep this disposable demo local: anyone who can reach it can sign in
using the fixed code. Use a fresh deployment and the
[production guide](https://bisibility.com/docs/self-hosting)
for real use.

[Full local demo instructions](https://bisibility.com/docs/quickstart).

## Data and costs

- **Hosted:** The service is paid. With BYOK, you pay your providers directly
  for usage. You can also use bisibility credits for supported operations
  without connecting your own provider account.
- **Self-hosted:** There is no application subscription or per-keyword
  license fee. You manage your infrastructure and provider accounts,
  and pay for infrastructure and provider usage.

BYOK rank tracking supports DataForSEO and SerpApi. Keyword, backlink,
and domain research use DataForSEO; AI Tracking uses supported
DataForSEO sources.

See [provider setup and budget controls](https://bisibility.com/docs/integrations)
and the [rank-check cost calculator](https://bisibility.com/rank-tracking-cost-calculator).

## API and agents

Build reports, access ranking history, and automate SEO workflows through
[REST and OpenAPI](https://bisibility.com/docs/api/overview)
or connect an AI agent through [MCP](https://bisibility.com/docs/agents).

Use the [TypeScript, Python, and Go SDKs](https://bisibility.com/docs/sdks/overview)
or [CLI](https://bisibility.com/docs/cli) for integrations, and
[signed webhooks](https://bisibility.com/docs/api/webhooks)
to react to events.

Slack tenant delivery is available as an API-only preview. Workspace installation and channel management
are not yet exposed in the dashboard.

## Feedback and development

[Report a bug](https://github.com/CorgiCorner/bisibility/issues/new?template=bug_report.yml) ·
[Request a feature](https://github.com/CorgiCorner/bisibility/issues/new?template=feature_request.yml) ·
[Discussions](https://github.com/CorgiCorner/bisibility/discussions) ·
[Releases](https://github.com/CorgiCorner/bisibility/releases) ·
[X](https://x.com/bisibility_com) ·
[Maker](https://x.com/msniezynski)

This repository publishes release snapshots. Feedback is welcome through
issues and discussions; external pull requests are not accepted.
See the [contribution guidelines](.github/CONTRIBUTING.md).
Report vulnerabilities through the [security policy](.github/SECURITY.md).

## License

The application is [AGPL-3.0-only](LICENSE). The
[Claude Code plugin](plugins/bisibility/) is separately [MIT licensed](plugins/bisibility/LICENSE).
