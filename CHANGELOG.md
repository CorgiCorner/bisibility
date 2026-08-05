# Changelog

## Unreleased

## [0.4.0] - 2026-08-05

- Signing in with an existing session now goes straight to the requested page instead of showing the sign-in form again; add `?switch=1` to reach the form.

- A project you cannot open now explains which account you are signed in as and offers an account switch, and the 404 page no longer suggests a route that does not exist.

- Legacy `/app/overview` links, including those in browser extension 0.3.0, now redirect to the workspace entry point instead of returning 404.

- A session whose account no longer exists now ends and returns you to sign-in, and a failed sign-out reports the error instead of appearing to do nothing.

- Aligned landing-page category and feature copy with shipped keyword, backlink, analytics, and signal-timeline capabilities.

- Reconciled public product claims with shipped Share of Voice, team roles, audit logging, signed webhooks, analytics connections, and deploy/CMS signals.

- Added an MIT-licensed Claude Code marketplace plugin with OAuth MCP setup and three cost-gated SEO workflow skills.

- Refreshed alternatives copy, AI-visibility roadmap wording, and the OpenSEO comparison with current pricing, issue, provider, and Domain Overview evidence.

- Merged the feature spec and feature request forms into a single feature request form and renamed spec terminology across contribution docs.

- Seeding with `BISIBILITY_SEED_API_KEY` now requires a generated `bsb_key_live_` or `bsb_key_test_` token, so a passphrase can no longer become a project API key.

- Updated Prisma and Hono dependencies so the installation tree no longer contains the advisory-affected Hono server and middleware versions.

- Added explicit scheduler drivers and versioned Compose overlays for core, external-worker, and bundled Temporal deployments.

- Added a generated separate Temporal PostgreSQL credential for bundled scheduling, with a compatibility fallback for existing installations.

- OAuth access tokens are now issued only for the MCP resource, so an authorization grant can no longer be redeemed for a token addressed to the authorization server.

- Storybook now builds with Vite instead of Webpack, which removes the advisory-affected development-only `elliptic` dependency from the install tree.

- Fixed Docker application builds to use the supported 4 GiB heap ceiling instead of Node's lower container default.

## [0.3.5] - 2026-08-03

- Updated HTTP and URI parsing dependencies to address newly disclosed security advisories.

- Improved OAuth consent and expiry screens with client-specific guidance, clearer API token consequences, and correct retry instructions.

- Fixed the app sidebar showing collapsed, icon-only content at full expanded width after returning to a background tab.

## [0.3.4] - 2026-08-03

- Fixed public CI and snapshot validation to replace inherited Node heap settings with the pinned 4 GiB limit.

## [0.3.3] - 2026-08-02

- Fixed public snapshot validation builds to use a 4 GiB Node heap when the caller has not set a
  larger limit.

## [0.3.2] - 2026-08-02

- Fixed the public CI contract validator so release security scans pass without constructing
  regular expressions from validator arguments.

## [0.3.1] - 2026-08-02

- Fixed public CI to exercise PostgreSQL migration settlement retries and identify failing tests in sharded logs.

## [0.3.0] - 2026-08-02

Known issue: Public source CI for this release contained a workflow-validation mismatch. The
release process and public CI contract were corrected in v0.3.3.

- Preserved OAuth consent and other return destinations when email OTP sign-in requires two-factor
  verification.
- **Breaking:** Resend contact and segment sync now requires `RESEND_CONTACTS_API_KEY`;
  `RESEND_API_KEY` is only for deployments sending email with `EMAIL_PROVIDER=resend`.
- **Breaking:** `BETTER_AUTH_SECRETS` must list versions in strictly descending order, and any
  configured `BETTER_AUTH_SECRET` must contain at least 16 characters.
- Added complete verification modes for rotating Better Auth 2FA envelopes and
  application-encrypted provider credentials without partial scans.
- Added REST and hosted MCP operations to list, save, and delete keyword ideas without starting
  rank tracking.
- Fixed hosted MCP discovery: the apex uses the regional authorization issuer, REST metadata stays
  regional, and self-hosted installs keep one origin.
- Fixed MCP discovery and initialization metadata to report the application package version
  instead of `0.0.0` when npm lifecycle variables are unavailable.

- Added a canonical cross-language SDK behavior contract covering authentication, timeouts,
  retries, cancellation, errors, headers, cursor iteration, and sync/async parity.

- Added status-only anonymous `/liveness` and `/readiness` responses, and protected detailed
  `/health` diagnostics behind API credentials or the optional `INTERNAL_PROBE_TOKEN`.

## [0.2.3] - 2026-07-31

- Fixed release completion when GHCR visibility updates are unavailable but the published images
  already pass anonymous pull verification.

## [0.2.2] - 2026-07-31

- Fixed public multi-architecture image publication so release builds reliably publish the web and
  worker images to both Docker Hub and GHCR.

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
