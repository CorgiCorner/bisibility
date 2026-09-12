#!/usr/bin/env sh
set -eu

: "${BISIBILITY_API_KEY:?set BISIBILITY_API_KEY}"
: "${BISIBILITY_BASE_URL:?set BISIBILITY_BASE_URL to https://<region-host>/api/v1}"

bisibility config set baseUrl "$BISIBILITY_BASE_URL"
bisibility config set apiKey "$BISIBILITY_API_KEY"
bisibility auth status
bisibility projects list
bisibility keywords list --limit 20
