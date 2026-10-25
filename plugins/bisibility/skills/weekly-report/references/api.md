# Weekly report - REST contract

Read scope; resolved origin + `/api/v1`. All operations are GETs.

| Operation | Purpose |
|-|-|
| GET /projects/{project_id}/saved-views | Only when a named segment needs resolving |
| GET /projects/{project_id}/keywords | Resolve bounded keyword identities |
| GET /keywords/{id}/rank-checks | status=completed, since, until, limit, cursor |
| GET /rank-checks/{check_id} | Optional specific detail; check_... public ID |
| GET /projects/{project_id}/competitors | Optional current meta.markets context, not a weekly time series |

Lists paginate with meta.next_cursor. Personal tokens may need the
X-Bisibility-Project header on projectless paths. Results include ranking_url and
observation_completeness. Only complete coverage supports absence within depth;
null/unknown/truncated is not a numeric loss. Compare suitable observations with
stated dates, market, device and coverage; disclose missing baselines.
