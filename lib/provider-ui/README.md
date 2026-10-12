# Provider management adapter

The server actions authenticate the current session and resolve a public project ID. Every transaction rereads the current user and membership and derives its own binding. Reads use a consistent snapshot; mutations lock the project against concurrent settings changes. Read-only members retain stored reads and reconciliation; only current manage grants on writable projects may execute commands.

The supported commands are exact native-cent rate overrides and atomic allocation batches. Connections, credential tests, OAuth, funding switches and provider probes remain existing host UI slots. Stored connection status does not assert live provider availability. Native availability, incomplete measurements and request quotes stay unavailable or unknown.

The application consumes the published `@usagekit/core`, `meter`, `providers`, `react`, `store` and `views` packages at exact version `0.9.0`. The verified React provider scopes shared connection, allocation and action hooks to the current project and principal. Failed stored reads and denied saves can be explicitly reloaded to reverify current access; editing stays fenced until current evidence and permission are available. An ambiguous save retains its original command for reconciliation.

Rate prices and provenance require a matching current shared rate. Allocation drafts retain their original rows and CAS revision while financial evidence and balance suggestions use the latest successful authorized read. Read or binding failures hide financial evidence and disable writes without losing the draft. Explicit Reload replaces that draft with the recovered snapshot. The budget dialog omits legacy monthly totals whose freshness cannot be established by the shared allocation read. Native provider observations are cleared before a new probe and hidden when the connection revision changes.

`provider_ui_authority` retains the installation's random journal authority. `provider_ui_commands` retains principal, scope, nonce, canonical body hash and a neutral result without credentials or connection DTOs. Mutation, existing audit, authoritative Store budget updates and journal result commit in one PostgreSQL transaction. Repeated original commands return that result; changed nonce bodies are invalid. An absent journal entry is ambiguous, including after a transaction error. Reconciliation never executes a mutation or claims `not_applied` from absence.

Management-only database triggers advance connection/project revision counters for management edits, credential changes and child-rate writes, so equal timestamps and A-to-B-to-A edits cannot reuse an old CAS token. Traffic timestamps do not advance the counter. The adapter uses the existing project mutation lock and calls transaction-bound services, without nested transactions. Budget commands persist versioned Store budgets and advance the management revision in the same transaction. Project caps apply alongside funding-specific connection budgets; there is no allocation-initialization or monthly authority mode.

Allocation extensions supply only capabilities and evidence authorized for the current reader. Missing, stale or incomplete evidence remains unknown. BYOK limits use the catalog's native unit and remain independent of other funding sources.

Portable revision/journal SQL regressions run with PGlite. Real transaction/race tests require `PROVIDER_UI_TEST_DATABASE_URL` pointing to an explicitly owned loopback `usage_controls_fixture` database with current migrations; they never call a provider. No shared development or production database is accepted.

The existing host Prisma Store remains the durable accounting implementation. Its schema mappings, transaction-bound budgets and ledger authority are not replaced by the independently available Postgres package. Durable verification covers exact budgets, signed cursors, receipts and dispatch fencing after a database restart between independent application processes.

Custom rates estimate own-key provider cost only. They do not affect customer prices
for platform-funded requests.
Manual prices live in `provider_connection_rates`. The legacy `costPerCheckCents`
API field is a projection of its `rank_check` row, not a second stored price.

Manual rows are editable coefficients, not measured whole-request prices. Separate read-only reference requests use the same credential-bound catalog quote as admission, including item counts, clickstream and native receipt provenance. Legacy imported or pooled feature costs never price these rows. Clearing an override lets each request variant resolve its own measured or catalog quote. Unknown historical counts remain unknown.
