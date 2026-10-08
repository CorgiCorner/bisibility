# Bisibility plugin for Claude Code

This plugin installs the Bisibility remote MCP connection and four focused SEO skills as one versioned package.

## Install

Run these commands in Claude Code:

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

- `/bisibility:rank-tracking-report` builds a read-only, evidence-backed ranking movement report.
- `/bisibility:keyword-opportunity-research` researches and prioritizes keyword ideas with an estimate-first cost gate.
- `/bisibility:backlink-profile-analysis` analyzes a site or page backlink profile with an estimate-first cost gate.

- `/bisibility:seo-audit` collects a bounded Site Audit, saved ranking and AI evidence, prioritizes actions, saves an AgentReport and returns its project link. Requires Bisibility v0.28.0 or newer with the corresponding MCP tools exposed.

Example invocation:

```text
/bisibility:seo-audit Audit my example.com project, prioritize technical,
content and visibility findings, save the report and give me its link.
Use existing ranking/AI data and the free bounded crawl; do not spend on providers.
```

The external client's model performs the analysis. Bisibility provides MCP data and storage; there is no built-in autonomous audit agent. The crawl is an HTTP sample of at most 15 pages in 15 seconds, not a full-site or Lighthouse audit. Missing sources and partial results remain visible in the report.

For Codex or another Agent Skills client, copy the complete `plugins/bisibility/skills/seo-audit` directory (including `references` and `scripts`) from the release checkout into the client's skill directory, such as `~/.codex/skills/seo-audit`. Connect that client to MCP using the [agent setup guide](https://bisibility.com/docs/agents), then invoke `$seo-audit` with the same prompt. The Claude Code marketplace commands above apply only to Claude Code. Do not install just the SKILL.md without its references.

Core tools are `list_projects`, `get_project`, `get_project_context`, `run_site_audit`, `get_site_audit`, `list_keywords`, `list_agent_reports`, `get_agent_report` and `create_agent_report`. Optional tools include `get_rank_history`, `list_search_performance_query_stats`, `analyze_ai_visibility` and `compare_ai_prompts`; the latter two require estimate-first spending approval. See the skill's [workflow](skills/seo-audit/references/workflow.md) and [report contract](skills/seo-audit/references/report.md). Client namespaces may prefix tool names.

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
- Paid provider workflows call `estimate_only` first and stop for approval before a cache miss can spend budget.
- `fresh: true` and additional paid calls require explicit spending approval. A request to audit and save authorizes its bounded free crawl and project-local report save; other mutations or public publishing are separate requests.
- Reports distinguish provider data, derived calculations, missing data, and interpretation.

## Versioning

The marketplace entry and plugin manifest use the same version. Every released plugin change must bump both values and update [CHANGELOG.md](./CHANGELOG.md).

## License

This directory and all content beneath it are licensed under the [MIT License](./LICENSE). The rest of the Bisibility repository remains licensed under `AGPL-3.0-only` unless a more specific license notice says otherwise.
