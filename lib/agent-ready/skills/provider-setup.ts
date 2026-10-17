import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "provider-setup",
  title: "Provider setup",
  description:
    "Connect, test, tune, or disconnect a search-data provider for a bisibility project. Use when an agent must wire up bring-your-own provider credentials so rank checks can run, or diagnose a provider that is failing.",
  compatibility: "Requires a bisibility origin and a bearer API key with write scope.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Provider setup

Inspect the intended provider and repair only the connection or setting the user
requested. Providers are bring-your-own; never show credentials in commands,
responses, chat or logs. Do not disconnect a working provider as routine cleanup.

## Prerequisites

Resolve \`$BISIBILITY_BASE\` including \`/api/v1\`, a write-scoped bearer credential
in \`$BISIBILITY_API_KEY\`, and the target \`$PROJECT_ID\` from \`GET /projects\`.
Scope alone does not override project permissions. Confirm the provider and
intended change before writing. Lists use \`data\` and \`meta.next_cursor\`; follow
pagination, read problem responses, and honor 429 retry windows.

## 1. Inspect the current connection

\`\`\`bash
curl -fsS "$BISIBILITY_BASE/projects/$PROJECT_ID/providers" -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

Use the entry's \`id\` for \`{provider_id}\` and inspect \`connection_id\`,
\`connection_status\`, \`enabled\` and \`capabilities\`. A catalog entry alone is not
an enabled, connected rank-check provider. If it is already correctly configured,
report that result and stop; do not reconnect or probe just to fill a checklist.

## 2. Connect or replace credentials only as requested

\`POST /projects/{project_id}/providers/{provider_id}/connect\` accepts a
\`credentials\` object with provider-specific \`api_key\`, \`login\`, \`secret\` or
\`endpoint\` fields. Use the instance's OpenAPI contract and provider requirements;
DataForSEO uses login and secret, while SerpAPI uses an API key. Supply secrets
through a protected request body, not literal values in command history.

This call verifies credentials before saving. Capture its non-secret connection
metadata and read \`GET /projects/{project_id}/providers\` again to confirm the
intended connection is enabled and has the required capability. A successful
connect does not require a second \`/test\` call and does not prove a rank check ran.
Reuse a stable \`Idempotency-Key\` on retries of the same approved connect.

## 3. Test only when diagnosing an existing connection

If a stored connection is failing or verification is the requested task, call
\`POST /projects/{project_id}/providers/{provider_id}/test\` using the stored
credentials. It is a live probe and may update recovery state. Check \`data.ok\`
and \`data.message\`: HTTP 200 alone is not a passing connection test.

If \`ok\` is false, report the returned reason and the specific correction needed.
Do not repeatedly probe, change credentials or reconnect without an agreed repair.

## 4. Change settings only when requested

\`PATCH /projects/{project_id}/providers/{provider_id}\` accepts \`enabled\` and
\`priority\`. For example, the approved change might be \`{"enabled":true,"priority":0}\`.
It does not accept a nested \`settings\` object or rotate credentials. Use the
connect endpoint for approved credential replacement; it verifies before save.
Read back the changed setting. Do not add an unrelated connection test.

## 5. Disconnect only for an approved removal

\`DELETE /projects/{project_id}/providers/{provider_id}\` removes the connection.
Confirm its identity and impact first, then read back the provider list. If rank
tracking must continue, explain whether a suitable enabled connection remains.
This step is not part of a normal successful setup.

## Report the result

Name the project and provider, the change performed, observed connection state,
enabled flag and relevant capability. For a diagnostic test, give its \`ok\` result
and non-secret reason. State whether rank checks were requested separately; setup
and verification do not establish new ranking data.`,
  references: [
    {
      path: "references/api.md",
      content: `# Provider setup - REST contract

Base: resolved origin + \`/api/v1\`; write scope and appropriate project permissions.

| Operation | Input / evidence |
|-|-|
| GET /projects/{project_id}/providers | data[].id, connection_id, connection_status, enabled, capabilities |
| POST /projects/{project_id}/providers/{provider_id}/connect | credentials; verifies before save |
| POST /projects/{project_id}/providers/{provider_id}/test | Stored credentials by default; inspect data.ok and data.message |
| PATCH /projects/{project_id}/providers/{provider_id} | enabled, priority only |
| DELETE /projects/{project_id}/providers/{provider_id} | Approved removal only |

Connect credentials: api_key for SerpAPI; login/secret for DataForSEO. Inspect the
current instance's OpenAPI/provider requirements. Do not put credentials in chat,
logs or command history. Reuse stable idempotency keys for retried approved writes.
Do not routinely retest after connect, which already verifies credentials.`,
    },
  ],
};
