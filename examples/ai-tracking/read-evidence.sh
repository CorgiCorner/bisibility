#!/usr/bin/env bash
set -eu

: "${BISIBILITY_BASE_URL:?Set the instance API root, including /api/v1}"
: "${BISIBILITY_API_KEY:?Set a read-scoped credential}"
: "${BISIBILITY_PROJECT_ID:?Set the project public ID}"

project_url="${BISIBILITY_BASE_URL%/}/projects/${BISIBILITY_PROJECT_ID}"
for resource in context ai-catalog 'ai-tracking/runs?limit=20'; do
  curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer ${BISIBILITY_API_KEY}" \
    "${project_url}/${resource}"
done
printf '\nOK ai-tracking-read-evidence\n'
