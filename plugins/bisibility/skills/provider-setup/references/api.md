# Provider setup - REST contract

Base: resolved origin + `/api/v1`; write scope and appropriate project permissions.

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
Do not routinely retest after connect, which already verifies credentials.
