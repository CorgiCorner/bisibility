# Router - discovery and scope

Base: resolved instance origin + `/api/v1`.

| Endpoint | Evidence |
|-|-|
| GET /capabilities | Public features and contracts; not an auth check |
| GET /projects | Authenticated project selection |
| GET /openapi.json | Instance REST contract |
| GET /llms.txt | API orientation |

Read/write/admin tiers remain bounded by project permissions. Project keys select
one project and cannot create projects; creation needs a write personal token.
Use X-Bisibility-Project for ambiguous projectless personal-token calls. Route to
a task skill and stop before execution unless execution is requested. Do not run
health probes or paid work simply to choose a skill.
