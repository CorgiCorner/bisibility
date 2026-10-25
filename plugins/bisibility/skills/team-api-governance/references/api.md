# Team & API governance - REST contract

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
responses. Verify consumer cutover before key revocation; never cause self-lockout.
