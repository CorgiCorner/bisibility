#!/usr/bin/env sh
set -eu

curl -X POST 'https://<your-instance>.example.com/api/ingest/deploy' \
  -H 'Authorization: Bearer <ingest-hook-token>' \
  -H 'Content-Type: application/json' \
  --data '{
    "deployment_id": "deploy_123",
    "environment": "production",
    "url": "https://example.com",
    "paths": ["/", "/pricing"]
  }'
