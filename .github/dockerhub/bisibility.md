# Bisibility

Open-source, self-hosted rank tracker. Track Google keyword positions for your
sites, with a REST API and a built-in MCP server for AI agents.

- Website: https://bisibility.com
- Self-hosting docs: https://bisibility.com/docs/self-hosting
- Source: https://github.com/CorgiCorner/bisibility
- Worker image: https://hub.docker.com/r/corgicorner/bisibility-worker

## Quick start

    VERSION={{RELEASE_TAG}}
    BASE_URL="https://github.com/CorgiCorner/bisibility/releases/download/${VERSION}"
    curl -fLO "${BASE_URL}/compose.yaml"
    curl -fLO "${BASE_URL}/bisibility.env.example"
    curl -fLO "${BASE_URL}/generate-self-host-env.mjs"
    node generate-self-host-env.mjs --site-url https://rank.example.com
    docker compose --env-file .env -f compose.yaml up -d

Replace `https://rank.example.com` with the final public origin. The app binds
to `127.0.0.1:3000` for a reverse proxy by default.

Scheduled rank checks require the worker image - see
https://hub.docker.com/r/corgicorner/bisibility-worker

## MCP

The MCP server is built into this image. No extra npm package is required:

    POST https://<host>/api/mcp
    Authorization: Bearer <your API key>

Discovery documents are served at `/.well-known/mcp.json`.

## Required environment

- `DATABASE_URL`, `DIRECT_URL`
- `BETTER_AUTH_SECRET`, `BISIBILITY_SECRETS_KEY` - generate each with
  `openssl rand -base64 32`

Full reference: https://bisibility.com/docs/self-hosting
