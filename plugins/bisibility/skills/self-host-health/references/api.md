# Self-host health - read-only contract

Base: resolved origin + `/api/v1`; read credential for detailed/project evidence.

| Operation | Evidence |
|-|-|
| GET /liveness | Web process response |
| GET /readiness | Database and blocking-migration readiness |
| GET /health | Aggregate anonymously; detailed diagnostics with valid auth |
| GET /capabilities | Public feature discovery, not credential validation |
| GET /projects | Authenticated accessible project inventory when needed |
| GET /projects/{project_id}/providers | Saved wiring, not a live provider probe |
| GET /projects/{project_id}/rank-check-runs/{run_id} | Queued run state, rcr_... |
| GET /keywords/{id}/rank-checks?status=completed | Persisted measurements, check_... |
| GET /rank-checks/{check_id} | One known measurement, never an rcr_... run |

Only perform symptom-relevant follow-ups. Distinguish unknown, deferred, blocked,
failed and completed states. Never repair or start checks in this workflow.
