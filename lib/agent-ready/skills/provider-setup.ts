import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "provider-setup",
  title: "Provider setup",
  description:
    "Connect, test, tune, or disconnect a search-data provider for a bisibility project. Use when an agent must wire up bring-your-own provider credentials so rank checks can run, or diagnose a provider that is failing.",
  compatibility: "Requires a bisibility origin and a bearer API key with write scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Provider setup

Connect a search-data provider to a bisibility project, verify the connection,
adjust its settings, and disconnect it when no longer needed. Providers are
bring-your-own: you supply the provider's own credentials and bisibility stores
them in the instance. Rank checks cannot run until at least one provider is
connected and passing its test.

**When to use this skill:** an agent needs to enable rank tracking for a project
(no working provider yet), rotate provider credentials, change a connected
provider's settings, or triage a provider whose checks are failing.

## Prerequisites

- A bisibility **origin / base URL**. Resolve it before calling anything:
  EU hosted region is \`https://eu.bisibility.com/api/v1\`; self-hosted is
  \`https://your-host.example/api/v1\`. Use whichever the user/instance gives you.
- A **bearer API key with \`write\` scope** in \`$BISIBILITY_API_KEY\`. Send it as
  \`Authorization: Bearer $BISIBILITY_API_KEY\`. Never print, log, or echo the key.
- The target \`project_id\` (\`prj_...\`). If unknown, discover it via
  \`GET /projects\` (see the bisibility router skill).
- The provider's own credentials (API token, etc.). These are secrets - pass them
  only in the connect request body; never store them in logs or chat output.

Set up your shell once:

\`\`\`bash
BASE="https://eu.bisibility.com/api/v1"   # or https://your-host.example/api/v1
AUTH="Authorization: Bearer $BISIBILITY_API_KEY"
PRJ="\${BISIBILITY_PROJECT_ID:?set a project id returned by GET /projects}"
\`\`\`

## Steps

### 1. List available / connected providers - \`GET /projects/{project_id}/providers\` (listProviders)

See which providers the instance supports and their current connection status
before changing anything. Note each entry's \`provider_id\` and \`status\`.

\`\`\`bash
curl -s "$BASE/projects/$PRJ/providers" -H "$AUTH"
\`\`\`

The response is \`{ "data": [...], "meta": { "next_cursor": "..." } }\`. Paginate
with \`?limit=<n>&cursor=<next_cursor>\` if the list is long. Each item typically
carries \`provider_id\`, a display \`name\`, \`status\` (e.g. connected / not
connected / error), and the settings currently in effect.

### 2. Connect the provider - \`POST /projects/{project_id}/providers/{provider_id}/connect\` (connectProvider)

Send the provider's bring-your-own credentials in the body. Include an
\`Idempotency-Key\` so a retried request does not create a duplicate connection.

\`\`\`bash
curl -s -X POST "$BASE/projects/$PRJ/providers/PROVIDER_ID/connect" \\
  -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{ "credentials": { "api_key": "<provider-token>" } }'
\`\`\`

The exact \`credentials\` fields depend on the provider - inspect the provider
entry from step 1 (or \`GET /api/v1/openapi.json\`) for the required keys. The
response confirms the connection and may return non-secret metadata; the stored
credential is never returned.

### 3. Test the connection - \`POST /projects/{project_id}/providers/{provider_id}/test\` (testProviderConnection)

Always verify before relying on the provider. This performs a live probe against
the provider using the stored credentials.

\`\`\`bash
curl -s -X POST "$BASE/projects/$PRJ/providers/PROVIDER_ID/test" -H "$AUTH"
\`\`\`

A passing test confirms credentials are valid and the provider is reachable. On
failure, read the \`application/problem+json\` body for the reason (bad
credential, quota, network) and fix it before proceeding.

### 4. Adjust settings - \`PATCH /projects/{project_id}/providers/{provider_id}\` (updateProviderSettings)

Tune non-secret behaviour (and rotate credentials) without reconnecting. Send
only the fields you want to change.

\`\`\`bash
curl -s -X PATCH "$BASE/projects/$PRJ/providers/PROVIDER_ID" \\
  -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{ "enabled": true, "settings": { "default_country": "us" } }'
\`\`\`

Re-run the test (step 3) after changing credentials. To rotate a credential,
PATCH the new value (or use connect again) and confirm with a fresh test.

### 5. Disconnect when done - \`DELETE /projects/{project_id}/providers/{provider_id}\` (disconnectProvider)

Remove a provider and its stored credential, e.g. when decommissioning or after
a leak.

\`\`\`bash
curl -s -X DELETE "$BASE/projects/$PRJ/providers/PROVIDER_ID" -H "$AUTH"
\`\`\`

After disconnecting, list providers again (step 1) to confirm, and ensure the
project still has at least one working provider if rank checks must keep running.

## Notes & gotchas

- **Plan before writing.** Always run step 1 (list) first so you act on a real
  \`provider_id\` and known status, rather than assuming.
- **Secrets discipline.** Credentials live only in the request body and in the
  instance. Never print them, never put them in an \`Idempotency-Key\`, and never
  read them back - the API does not return stored credentials.
- **Idempotency.** Connect / PATCH / disconnect accept an \`Idempotency-Key\`
  header; reuse the same key on retries to avoid duplicate side effects.
- **Errors.** Failures are \`application/problem+json\`. A \`429\` includes a retry
  window - back off and retry after it before re-testing.
- **A connection is not a guarantee.** Treat the test (step 3) as the source of
  truth; a provider can be "connected" yet failing on quota or an expired token.`,
  references: [
    {
      path: "references/api.md",
      content: `# Provider setup - endpoint cheat-sheet

Base path: \`/api/v1\`. Auth: \`Authorization: Bearer <api_key>\` (\`write\` scope).
Lists return \`{ data, meta: { next_cursor } }\`; paginate with
\`?limit=<n>&cursor=<next_cursor>\`. Errors: \`application/problem+json\` (429 has a
retry window). Writes accept an optional \`Idempotency-Key\` header.

| METHOD path | operationId | key fields |
|-|-|-|
| GET /projects/{project_id}/providers | listProviders | - (returns provider_id, name, status, settings) |
| POST /projects/{project_id}/providers/{provider_id}/connect | connectProvider | \`credentials\` (provider's bring-your-own secrets) |
| POST /projects/{project_id}/providers/{provider_id}/test | testProviderConnection | - (live probe; returns pass/fail) |
| PATCH /projects/{project_id}/providers/{provider_id} | updateProviderSettings | \`enabled\`, \`settings\`, credential rotation |
| DELETE /projects/{project_id}/providers/{provider_id} | disconnectProvider | - (removes stored credential) |

Notes:
- Provider credentials are bring-your-own and stored in the instance; never
  echoed back by the API. Never print or log them.
- \`provider_id\` (and exact \`credentials\` fields) come from listProviders or
  \`GET /api/v1/openapi.json\`.
- \`project_id\` looks like \`prj_...\`; discover via \`GET /projects\`.`,
    },
  ],
};
