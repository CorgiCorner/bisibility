# Keyword import - REST contract

Base: resolved origin + `/api/v1`; write scope and project permissions.
Personal-token paths without a project ID use X-Bisibility-Project when ambiguous.

| Operation | Contract |
|-|-|
| GET /projects/{project_id}/keywords | Paginate; compare text + canonical location + device |
| GET /projects/{project_id}/defaults | Resolve omitted market/device |
| POST /projects/{project_id}/keywords | keywords[]; at most 500; data.created/skipped/results[].keyword |
| POST /keywords/bulk | keyword_ids[] + operation + its shared fields; no updates[] |
| PATCH /keywords/{id} | Requested metadata correction; keyword identity is immutable |
| POST /keywords/{id}/checks | Explicitly approved paid check, max_cost_cents |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Poll queued rcr_... run |
| GET /keywords/{id}/rank-checks?status=completed | Read saved check_... measurements |

Bulk operations include add_tags, remove_tags, set_target_url, set_frequency and
delete; deletion requires the appropriate role and is not routine import cleanup.
Check created/skipped and per-ID status; read back the final rows. No automatic checks.
