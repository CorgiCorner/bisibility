# Changelog

## Unreleased

## [0.2.1] - 2026-07-31

- Added immutable standalone Compose, production environment, and secret-generator release assets,
  so production installs no longer require a source checkout.
- Expanded the distribution manifest to schema v2, binding release assets by SHA-256 alongside the
  public web and worker images, with fail-closed verification.
- Generated the public self-host environment from one registry, with fail-fast public origins,
  production mode by default, and no retired CDN variables.
- Replaced deprecated Temporal auto-setup 1.25.2 with Server and Admin Tools 1.31.2 and UI 2.49.1,
  including explicit idempotent schema and namespace setup.
- Added `upgrade.sh`, which verifies the target manifest and image revisions before stopping
  services, applying migrations, and restarting the matched web and worker images.
- Added API version negotiation through `/capabilities` and `Bisibility-API-Version: v1`; unsupported declared versions return a typed `409`.
- Added public, version-pinned web and worker images on Docker Hub and GHCR; Compose now pulls them
  by default, while `docker compose up --build` still builds from source.
- Added separate `/liveness` and `/readiness` probes so operators can restart only a dead web
  process and hold traffic until its database and blocking migrations are ready.
- Added `services.appRevision` and `services.workerRevision` to health reporting so operators can
  compare the public source revisions baked into web and worker artifacts.
- Fixed audit payload redaction to record only declared fields and strip credentials, queries, and fragments from declared URLs.

- Redesigned OAuth consent review to identify the account and client, group permissions, show the verified callback, and expire after five minutes.
- Added restrictive self-host crawl controls: `Disallow: /` and `X-Robots-Tag: noindex` by default, with an explicit indexing opt-in.
- Fixed migration readiness to require every bundled Prisma migration, active data migration checksum, and public ID contract to be current.
- Added OAuth 2.1 for hosted MCP with PKCE, dynamic client registration, audience-bound tokens, protected-resource metadata, and tool safety annotations.
- Fixed hosted MCP routing at `/api/mcp`; regional aliases return `421`, and cloud startup rejects divergent canonical and OAuth origins.

- **Breaking:** Ranking CSV exports add provider, requested depth, and normalization version; history packages must use migration format v6.
- Standardized rank checks on the best organic match, preserved provider URLs, and prevented comparisons across incompatible depth or normalization.

## [0.2.0] - 2026-07-30

- **Breaking:** Internal services (PostgreSQL, Valkey, Temporal Server) are no longer published on the
host, and the Temporal UI now binds to `127.0.0.1`. For host access use the shipped
`docker-compose.debug.yml`; for other bindings see the self-hosting guide.

  Example: `docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build`.

- Fixed fresh installs, which created a database schema that diverged from the data model.
- Fixed restart policies so the app, PostgreSQL, Valkey, and Temporal services restart unless stopped;
previously only the optional worker did.
- Fixed key rotation for provider credentials: `BISIBILITY_SECRETS_KEYS_RETIRED` now reaches the app
on Compose installs, so retired keys can still decrypt existing secrets, and the rotation scripts
run on the pinned Node runtime instead of resolving `tsx` from the network.
- Narrowed the Docker build context so local environment files, keys, certificates, deployment state,
and private material cannot enter checkout-built images.
- Corrected the upgrade-path documentation: backup and restore examples now run inside the PostgreSQL
container, and the rollback instructions warn that returning to 0.1.0 republishes the database and
cache ports.
- Corrected inaccurate claims about the contribution policy, CLI and Managed Cloud status, Search
Console versus GA4 data, and roadmap vocabulary.

## [0.1.0] - 2026-07-30

- Added self-hosted keyword rank tracking with Docker, PostgreSQL, Redis or Valkey, optional Temporal scheduling, and BYO DataForSEO or SerpAPI accounts.
- Added keyword and backlink research, position history, alerts, Search Console query metrics, GA4 landing-page metrics, and CSV export.
- Added REST API v1 with OpenAPI, an authenticated MCP endpoint, signed outbound webhooks, scoped API keys, team roles, and audit logging.
