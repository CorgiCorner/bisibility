# Bisibility worker

Background worker for **Bisibility** - open-source, self-hosted rank tracker.

This image is not standalone. It executes scheduled rank checks, alert delivery,
and maintenance jobs for `corgicorner/bisibility`.

- Web image: https://hub.docker.com/r/corgicorner/bisibility
- Website: https://bisibility.com
- Self-hosting docs: https://bisibility.com/docs/self-hosting
- Source: https://github.com/CorgiCorner/bisibility

## Quick start

Download the same {{RELEASE_TAG}} assets shown in the web image overview, then start the
worker under the `scheduled` Compose profile:

    docker compose --env-file .env -f docker-compose.self-host.yml \
      --profile scheduled up -d

## How it works

Temporal is split in two. The Temporal server stores workflow state and task
queues; this worker hosts the code that runs them. Starting the worker without a
reachable Temporal server does nothing.

## Required environment

- `DATABASE_URL` - the same PostgreSQL instance as the web service
- `BISIBILITY_SECRETS_KEY` - must be identical to the web service; it decrypts
  stored provider credentials
- `TEMPORAL_ADDRESS` (default `temporal:7233`), `TEMPORAL_NAMESPACE`
  (default `default`), `TEMPORAL_TASK_QUEUE` (default `rank-checks`)

`TEMPORAL_ADDRESS` can point at Temporal Cloud or a self-hosted cluster. For
Temporal Cloud, set `TEMPORAL_API_KEY`; the API key enables TLS automatically.
For a TLS-enabled self-hosted endpoint without an API key, set
`TEMPORAL_TLS=true`.
