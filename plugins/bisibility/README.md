# Bisibility plugin for Claude Code

This plugin installs the Bisibility remote MCP connection and three focused SEO skills as one versioned package.

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

The package intentionally does not claim to crawl websites or run a general technical site audit because the Bisibility MCP tool contract does not expose a crawler.

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
- `fresh: true`, additional paid pages, writes, deletions, and external publishing always require explicit approval.
- Reports distinguish provider data, derived calculations, missing data, and interpretation.

## Versioning

The marketplace entry and plugin manifest use the same version. Every released plugin change must bump both values and update [CHANGELOG.md](./CHANGELOG.md).

## License

This directory and all content beneath it are licensed under the [MIT License](./LICENSE). The rest of the Bisibility repository remains licensed under `AGPL-3.0-only` unless a more specific license notice says otherwise.
