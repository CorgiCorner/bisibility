import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "team-api-governance",
  title: "Team & API governance",
  description:
    "Audit and manage bisibility API keys, project team membership/invites, and migration tokens. Use this skill when an agent must rotate or revoke API keys, review or change who can access a project, or mint/revoke a one-time data-migration token.",
  compatibility: "Requires a bisibility origin and a bearer API key with admin scope.",
  kind: "task-skill",
  version: "0.1.1",
  body: `# Team & API governance

Audit project keys, team access and migration-token metadata, then explain
specific access risks. Perform access changes only when the user requests and
confirms them. An audit does not require creating secrets or rotating keys.

## Prerequisites and scope

Resolve \`$BISIBILITY_BASE\` including \`/api/v1\`, \`$PROJECT_ID\` from \`GET /projects\`,
and a bearer credential with admin scope and appropriate project permissions.
Send \`Authorization: Bearer $BISIBILITY_API_KEY\`; never display the credential.
A personal token also needs \`X-Bisibility-Project: $PROJECT_ID\` on paths without
a project ID when the project would otherwise be ambiguous.

These operations are project scoped, not an instance-wide access inventory.
Lists use \`data\` and \`meta.next_cursor\`; paginate the agreed scope. Honor 429
retry windows and inspect problem response detail. Reuse a stable
\`Idempotency-Key\` for retries of an approved write.

## 1. Audit the requested access surface

- \`GET /api-keys\`: inspect key IDs, names, scopes, expiry, revocation and last-used
  timestamps. An existing key is not necessarily active; last-used alone does not
  prove a consumer no longer needs it. Plaintext secrets are not returned.
- \`GET /projects/{project_id}/team/members\`: inspect current roles.
- \`GET /projects/{project_id}/team/invites\`: inspect pending invitations.
- \`GET /projects/{project_id}/migration-tokens\`: only when migration-token access
  is in scope; inspect current token metadata, not a secret.

Compare against the stated access policy. Identify concrete excess scope,
unexpected roles or invitations and unresolved ownership. Stop with recommendations
when the user requested an audit. Do not mint test keys or tokens as proof.

## 2. Create or rotate a project key only when approved

\`POST /api-keys\` accepts \`name\`, explicit \`scope\` (\`read\`, \`write\`, \`admin\`) and
\`expires_in_days\` (30, 90, 365 or null). Omitted scope defaults to admin, so always
set the least privilege deliberately. Example approved reporting-key input:

\`\`\`json
{"name":"ci-weekly-report","scope":"read","expires_in_days":90}
\`\`\`

The creation response contains the plaintext \`token\` once. Route the response
directly to the approved protected credential destination; do not print a raw curl
response, log it, paste it into chat or expose it in an archive. Verify replacement
consumer access before \`DELETE /api-keys/{key_id}\` revokes the old key.

Confirm the exact key ID and its dependencies first. Do not revoke the current
credential or last usable admin credential without a verified replacement. After
an approved change, read metadata back and describe the result without its secret.

## 3. Change team access only when requested

Read current membership/invitations first. For an approved invite,
\`POST /projects/{project_id}/team/invites\` takes \`email\` and explicit \`role\`
(\`viewer\`, \`member\` or \`admin\`). Avoid duplicate invitations and choose the least
role needed. Sending an invite is an external action; an audit alone does not
authorize it. Read back the pending invitation after creation.

Use \`DELETE /team/invites/{invite_id}\` only to cancel a confirmed pending invite.
Use returned public IDs and verify the result; do not invent an invite ID or remove
a member as a side effect of reviewing invitations.

## 4. Manage migration tokens only for an active, approved migration

First inspect \`GET /projects/{project_id}/migration-tokens\`. Minting a new token
invalidates existing active tokens for this project, so verify the impact before
\`POST /projects/{project_id}/migration-tokens\`. The body is \`{"scope":"keywords"}\`
or \`{"scope":"full"}\`; scope defaults to full. A \`note\` is not a token scope.

Capture the one-time secret directly into the approved protected destination.
The token is single use and expires; inspect the returned metadata. Its public
record ID has the \`ferry_...\` prefix, distinct from the secret. Revoke a remaining
active token with \`DELETE /migration-tokens/{token_id}\` after cancellation or when
no longer needed; confirm metadata afterward. Do not expose token values or mint
another token merely to test the API.

## Report the outcome

State the project and audit coverage, verified findings, recommended least-scope
changes and unresolved dependencies. For authorized changes, name the affected
public IDs and metadata readback. Distinguish recommendations from changes actually
performed; never include bearer keys, new key tokens or migration secrets.`,
  references: [
    {
      path: "references/api.md",
      content: `# Team & API governance - REST contract

Admin scope and appropriate project role; all inventory is project scoped.
Personal-token projectless paths may need X-Bisibility-Project.

| Operation | Input / purpose |
|-|-|
| GET /api-keys | Names, scope, expiry, revoked_at, last_used_at; no plaintext |
| POST /api-keys | name, explicit scope, expires_in_days=30/90/365/null; token returned once |
| DELETE /api-keys/{key_id} | Confirm dependencies and replacement first |
| GET /projects/{project_id}/team/members | Current roles |
| GET /projects/{project_id}/team/invites | Pending invitations |
| POST /projects/{project_id}/team/invites | Approved email + viewer/member/admin role |
| DELETE /team/invites/{invite_id} | Approved cancellation |
| GET /projects/{project_id}/migration-tokens | Current token metadata |
| POST /projects/{project_id}/migration-tokens | scope=keywords/full; invalidates prior active tokens |
| DELETE /migration-tokens/{token_id} | Returned ferry_... record ID, not the token secret |

No writes during an audit. Store creation secrets securely without printing raw
responses. Verify consumer cutover before key revocation; never cause self-lockout.`,
    },
  ],
};
