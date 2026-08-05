# Bisibility worker

This image contains the Bisibility Temporal worker only. It contains no Temporal
server and never falls back to a local server when the configured endpoint fails.

The worker executes scheduled rank checks, alert delivery, and maintenance jobs
for `corgicorner/bisibility`. It is not standalone.

- Web image: https://hub.docker.com/r/corgicorner/bisibility
- Website: https://bisibility.com
- Self-hosting docs: https://bisibility.com/docs/self-hosting
- Source: https://github.com/CorgiCorner/bisibility

## Quick start

Download the {{RELEASE_TAG}} core, worker, and Temporal overlays, then start the
bundled scheduling topology:

    docker compose --env-file .env \
      -f compose.yaml -f compose.worker.yaml -f compose.temporal.yaml up -d

## How it works

Temporal is split in two. The Temporal server stores workflow state and task
queues; this worker hosts the code that runs them. Starting the worker without a
reachable Temporal server does nothing.

## Required environment

- `DATABASE_URL` - the same PostgreSQL instance as the web service
- `BISIBILITY_SECRETS_KEY` - must be identical to the web service; it decrypts
  stored provider credentials
- `SCHEDULER_DRIVER=temporal`
- `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`, and
  `TEMPORAL_ALERT_DELIVERY_TASK_QUEUE`, shared exactly with the web service

`TEMPORAL_ADDRESS` can point at Temporal Cloud or a self-hosted cluster. For
Temporal Cloud, set `TEMPORAL_API_KEY`; `TEMPORAL_TLS=auto` then enables TLS.
A custom `TEMPORAL_ADDRESS` alone does not enable TLS. For a TLS-enabled
self-hosted endpoint without an API key, set `TEMPORAL_TLS=true`.
