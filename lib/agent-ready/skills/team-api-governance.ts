import type { TaskSkill } from "./types";

export const skill: TaskSkill = {
  slug: "team-api-governance",
  title: "Team & API governance",
  description:
    "Audit and manage Bisibility API keys, project team membership/invites, and migration tokens. Use this skill when an agent must rotate or revoke API keys, review or change who can access a project, or mint/revoke a one-time data-migration token.",
  compatibility: "Requires a Bisibility origin and a bearer API key with admin scope.",
  kind: "task-skill",
  version: "0.1.0",
  body: `# Team & API governance

Governs the sensitive, admin-scoped surface of a Bisibility instance: API keys,
project team members/invites, and migration tokens. All operations here can grant
or revoke access, so plan every change before issuing a write.

## When to use this skill

Use it when you are asked to:
- Audit, create, rotate, or revoke **API keys**.
- Review **team members**, or send/revoke **team invites** for a project.
- Mint or revoke a **migration token** (a short-lived credential for exporting or
  moving a project's data to another instance).

For SEO/keyword/provider work, use the task skill for that area instead.

## Prerequisites

1. **Origin / base URL.** EU Cloud is \`https://eu.bisibility.com/api/v1\`; self-hosted
   is \`https://your-host.example/api/v1\`. Resolve the correct one before any call
   (ask the user, or read \`BISIBILITY_BASE_URL\`).
2. **Admin API key.** Every operation here needs the \`admin\` scope. Export it as
   \`BISIBILITY_API_KEY\` and send \`Authorization: Bearer $BISIBILITY_API_KEY\`.
   **Never print, log, or echo the key, a newly created key, or a migration
   token.** Show new secrets to the user once, through a secure channel, and treat
   them as write-once.
3. Set \`PROJECT_ID\` to the target public project id returned by \`GET /projects\`
   for team and migration-token work.

## Conventions

- List endpoints return \`{ "data": [...], "meta": { "next_cursor": "..." } }\`.
  Page with \`?limit=<n>&cursor=<next_cursor>\` until \`next_cursor\` is null.
- Errors are \`application/problem+json\`; on \`429\` honor the retry window.
- Write/delete methods accept an optional \`Idempotency-Key\` header - set one on
  create/revoke so a retry cannot double-issue or double-revoke.

## Steps

### 1. Orient: audit API keys
\`GET /api-keys  (listApiKeys)\`

List existing keys (id, name, scope, expiry, last-used) before changing anything. This
shows what would break if you revoke a key.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/api-keys?limit=50" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 2. Create / rotate an API key
\`POST /api-keys  (createApiKey)\`

Create a new key with the **least scope** needed (\`read\`, \`write\`, or \`admin\`),
a clear name, and a deliberate expiry. Omitted scope defaults to \`admin\` for
backward compatibility. The plaintext secret is returned **only in this response** -
capture it securely, never log it.

\`\`\`bash
curl -s -X POST "$BISIBILITY_BASE_URL/api-keys" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"name":"ci-weekly-report","scope":"read","expires_in_days":90}'
\`\`\`

To rotate: create the replacement first, cut consumers over, then revoke the old
key in step 3.

### 3. Revoke an API key
\`DELETE /api-keys/{key_id}  (revokeApiKey)\`

Revocation is immediate and irreversible. Confirm the \`key_id\` against the step-1
listing and verify nothing in production still depends on it.

\`\`\`bash
curl -s -X DELETE "$BISIBILITY_BASE_URL/api-keys/key_a00000000000000000000000" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 4. Review project team membership
\`GET /projects/{project_id}/team/members  (listTeamMembers)\`
\`GET /projects/{project_id}/team/invites  (listTeamInvites)\`

List current members and any pending invites to see who has access.

\`\`\`bash
curl -s "$BISIBILITY_BASE_URL/projects/$PROJECT_ID/team/members" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
curl -s "$BISIBILITY_BASE_URL/projects/$PROJECT_ID/team/invites" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 5. Invite a teammate
\`POST /projects/{project_id}/team/invites  (createTeamInvite)\`

Invite by email with an explicit role. Re-check step 4 first so you do not create
a duplicate invite for someone already a member.

\`\`\`bash
curl -s -X POST "$BISIBILITY_BASE_URL/projects/$PROJECT_ID/team/invites" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"email":"teammate@example.com","role":"member"}'
\`\`\`

### 6. Revoke a pending invite
\`DELETE /team/invites/{invite_id}  (revokeTeamInvite)\`

Cancels an invite that has not been accepted. Use the \`invite_id\` from step 4.

\`\`\`bash
curl -s -X DELETE "$BISIBILITY_BASE_URL/team/invites/inv_..." \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

### 7. Mint a migration token (only when migrating data)
\`POST /projects/{project_id}/migration-tokens  (mintMigrationToken)\`

A migration token is a short-lived, high-trust credential that authorizes another
instance to pull this project's data. Mint one only for an active migration, scope
it to the single project, and deliver it securely. **Do not print it.**

\`\`\`bash
curl -s -X POST "$BISIBILITY_BASE_URL/projects/$PROJECT_ID/migration-tokens" \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"note":"move to self-hosted instance"}'
\`\`\`

### 8. Revoke the migration token when done
\`DELETE /migration-tokens/{token_id}  (revokeMigrationToken)\`

Always revoke immediately after the migration completes (or if it is aborted) so
the credential cannot be reused.

\`\`\`bash
curl -s -X DELETE "$BISIBILITY_BASE_URL/migration-tokens/mtk_..." \\
  -H "Authorization: Bearer $BISIBILITY_API_KEY"
\`\`\`

## Notes & gotchas

- **Plan before every write.** Each create/revoke here changes who can access the
  instance or its data. List first (steps 1, 4), confirm the target id, then act.
- **Least privilege.** Default new keys and invites to the lowest scope/role that
  works; reserve \`admin\` for true administrators.
- **Secrets are write-once.** API keys and migration tokens are shown in full only
  at creation. If a value is lost, revoke and re-issue rather than trying to
  recover it.
- **Avoid self-lockout.** Do not revoke the very key you are authenticating with,
  or the last \`admin\` key, without a verified replacement already in place.
- **Time-box migration tokens.** They are the most sensitive credential here;
  mint just-in-time and revoke as soon as the migration finishes.`,
  references: [
    {
      path: "references/api.md",
      content: `# Team & API governance - endpoint cheat-sheet

Base path: \`/api/v1\` | Auth: \`Authorization: Bearer <api_key>\` | Scope: **admin**

## API keys
| METHOD path | operationId | key fields |
|-|-|-|
| GET /api-keys | listApiKeys | \`?limit\`, \`?cursor\` |
| POST /api-keys | createApiKey | \`name\`, \`scope\` (read/write/admin), \`expires_in_days\` (30/90/365/null); omitted scope defaults to admin; secret returned once |
| DELETE /api-keys/{key_id} | revokeApiKey | \`key_id\` (irreversible) |

## Team
| METHOD path | operationId | key fields |
|-|-|-|
| GET /projects/{project_id}/team/members | listTeamMembers | \`project_id\` |
| GET /projects/{project_id}/team/invites | listTeamInvites | \`project_id\` |
| POST /projects/{project_id}/team/invites | createTeamInvite | \`email\`, \`role\` |
| DELETE /team/invites/{invite_id} | revokeTeamInvite | \`invite_id\` |

## Migration tokens
| METHOD path | operationId | key fields |
|-|-|-|
| POST /projects/{project_id}/migration-tokens | mintMigrationToken | \`note\`; token returned once |
| DELETE /migration-tokens/{token_id} | revokeMigrationToken | \`token_id\` |

## Conventions
- Lists: \`{ data, meta.next_cursor }\`; page with \`?limit=&cursor=\`.
- Errors: \`application/problem+json\`; honor \`429\` retry window.
- Set \`Idempotency-Key\` on every create/revoke to avoid double-issue/revoke.
- Never print API keys or migration tokens; they are shown in full only once.`,
    },
  ],
};
