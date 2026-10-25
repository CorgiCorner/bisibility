# Domain onboarding - REST contract

Base: resolved origin + `/api/v1`. Creation needs a write-scoped personal token;
project keys cannot create projects. Personal-token projectless paths need
`X-Bisibility-Project` when the project is ambiguous.

| Operation | Purpose |
|-|-|
| GET /projects | Find an existing project first |
| POST /projects | Create with name and domain; read data.id |
| PATCH /projects/{project_id}/defaults?preview_only=true | Preview intended defaults |
| PATCH /projects/{project_id}/defaults | Same patch plus exact confirmed review |
| GET /projects/{project_id}/providers | Reuse or connect the intended provider |
| POST /projects/{project_id}/keywords | Read data.created/skipped/results[].keyword.id |
| POST /keywords/{id}/checks | Approved paid check; optional max_cost_cents |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Poll queued run, rcr_... |
| GET /keywords/{id}/rank-checks?status=completed | Read measurements, check_... |

Defaults review requires expected_source_hash, expected_revision, preview_token,
idempotency_key and confirmed=true. Missing review: 428; stale preview: 409.
Never expose bearer/provider credentials or treat queue acceptance as completion.
