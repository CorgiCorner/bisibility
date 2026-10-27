# Bisibility skills

This package installs Bisibility skills and the remote MCP connection as one versioned plugin.

## Install

Install every skill for Claude Code, Codex, Cursor and other Agent Skills clients:

```text
npx skills add CorgiCorner/bisibility
```

Install one skill with `npx skills add CorgiCorner/bisibility --skill <slug>`. That command includes the skill's references.

Claude Code can also install the marketplace plugin:

```text
/plugin marketplace add CorgiCorner/bisibility
/plugin install bisibility
```

Run `/reload-plugins` if you want to activate the plugin in the current session. New sessions load it automatically.

Open `/mcp`, select Bisibility, and complete the browser sign-in. The hosted endpoint uses OAuth 2.0 Authorization Code with PKCE and dynamic client registration. Claude Code discovers the authorization server from the MCP protected-resource metadata. No API key belongs in this repository or plugin configuration.

The default MCP endpoint is:

```text
https://bisibility.com/api/mcp
```

For a self-hosted installation, set `BISIBILITY_MCP_URL` to that installation's HTTPS `/api/mcp` URL before starting Claude Code. The plugin never stores a customer URL or bearer token.

## Included skills

- `/bisibility:project-setup` saves reusable project context and proposes confirmed tracking setup.
- `/bisibility:seo-coach` recommends the next skill from saved context, research before new tracking, without writes or paid calls.
- `/bisibility:domain-onboarding` creates a domain project, confirms defaults and adds the first keywords through the REST API.
- `/bisibility:bisibility` resolves the instance and routes to the matching skill without executing it.
- `/bisibility:seo-audit` collects a bounded Site Audit, saved ranking and AI evidence, prioritizes actions, saves an AgentReport and returns its project link. Requires Bisibility v0.28.0 or newer with the corresponding MCP tools exposed.
- `/bisibility:ai-visibility-audit` audits retained AI mentions and citations, with optional approved research and report saving.
- `/bisibility:keyword-opportunity-research` starts with queries the project already shows up for, then paid keyword research with an estimate-first cost gate.
- `/bisibility:keyword-import` reconciles a supplied keyword list with tracked identities through the REST API.
- `/bisibility:rank-tracking-report` builds a read-only, evidence-backed ranking movement report.
- `/bisibility:weekly-report` summarizes saved rank movement for one window through the REST API.
- `/bisibility:alert-triage` verifies fired alerts against rank history and proposes confirmed per-alert changes.
- `/bisibility:backlink-profile-analysis` analyzes a site or page backlink profile with an estimate-first cost gate.
- `/bisibility:provider-setup` connects, tests or disconnects a search-data provider through the REST API.
- `/bisibility:team-api-governance` audits keys, team access and migration tokens through the REST API.
- `/bisibility:self-host-health` diagnoses liveness, readiness and health with read-only REST checks.
- `/bisibility:keyword-clustering` groups supplied or saved keywords with SERP-free heuristics by default, and optional user-supplied SERPs.
- `/bisibility:competitor-analysis` compares one rival with tracked project keywords, including preliminary and confirmed content formats.
- `/bisibility:competitive-landscape` maps sampled visibility across the project and up to five rivals with per-domain cost approval.
- `/bisibility:ai-prompt-research` proposes deduplicated category questions for Prompt Tracker from saved and free evidence, with separate approval for model generation and tracker writes.
- `/bisibility:local-seo` explains local map visibility from retained Local monitor runs. It does not create a monitor, launch a run or read a business profile.

Example invocation:

```text
/bisibility:seo-audit Audit my example.com project, prioritize technical,
content and visibility findings, save the report and give me its link.
Use existing ranking/AI data and the free bounded crawl; do not spend on providers.
```

The external client's model performs the analysis. Bisibility provides MCP data and storage; there is no built-in autonomous audit agent. The crawl is an HTTP sample of at most 15 pages in 15 seconds, not a full-site or Lighthouse audit. Missing sources and partial results remain visible in the report.

The skills CLI installs each complete skill directory, including references. Connect MCP using the [agent setup guide](https://bisibility.com/docs/agents), then invoke `$seo-audit` with the same prompt. The marketplace commands above apply only to Claude Code. Do not install just the SKILL.md without its references.

Core tools are `list_projects`, `get_project`, `get_project_context`, `run_site_audit`, `get_site_audit`, `list_keywords`, `list_agent_reports`, `get_agent_report` and `create_agent_report`. Optional tools include `get_rank_history` and `list_search_performance_query_stats`. This skill only reads already-saved AI reports; it never runs paid provider research. Missing AI reports are a coverage gap with a pointer to the separate `/ai-visibility-audit` workflow. See the skill's [workflow](skills/seo-audit/references/workflow.md) and [report contract](skills/seo-audit/references/report.md). Client namespaces may prefix tool names.

## Architecture

```text
Claude Code
  -> Bisibility skills plan and validate each workflow
  -> Bisibility MCP exposes authenticated tools over Streamable HTTP
  -> Bisibility app applies project permissions and calls the same API services as the dashboard
  -> Customer-owned provider connections supply ranking, keyword, and backlink data
```

The skills do not scrape the dashboard. They orchestrate the MCP tools published by the Bisibility app. OAuth credentials stay in Claude Code's secure credential storage, while provider credentials remain in the user's Bisibility instance.

## Safety and cost controls

- Read workflows paginate and report incomplete coverage instead of implying a full result.
- Paid provider workflows use `estimate_only` or their dedicated spend-free preview and stop for exact spending approval. Prompt Research model generation has an advisory forecast, not a guaranteed maximum, and requires explicit consent to that limitation.
- `fresh: true` and additional paid calls require explicit spending approval. A request to audit and save authorizes its bounded free crawl and project-local report save; other mutations or public publishing are separate requests.
- Reports distinguish provider data, derived calculations, missing data, and interpretation.

## Versioning

The marketplace entry and plugin manifest use the same version. Every released plugin change must bump both values and update [CHANGELOG.md](./CHANGELOG.md).

## License

This directory and all content beneath it are licensed under the [MIT License](./LICENSE). The rest of the Bisibility repository remains licensed under `AGPL-3.0-only` unless a more specific license notice says otherwise.
