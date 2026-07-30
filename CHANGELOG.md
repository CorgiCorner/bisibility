# Changelog

## Unreleased

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

### Known limitations

`migrations: "ready"` covers blocking data migrations and public IDs, not Prisma
schema. Use `npx prisma migrate status`. This is unchanged from 0.1.0; the fix
is scheduled.

## [0.1.0] - 2026-07-30

- Added self-hosted keyword rank tracking with Docker, PostgreSQL, Redis or Valkey, optional Temporal scheduling, and BYO DataForSEO or SerpAPI accounts.
- Added keyword and backlink research, position history, alerts, Search Console query metrics, GA4 landing-page metrics, and CSV export.
- Added REST API v1 with OpenAPI, an authenticated MCP endpoint, signed outbound webhooks, scoped API keys, team roles, and audit logging.
