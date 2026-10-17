# Alert investigation and confirmed changes

## Bound and corroborate

Use `list_triggered_alerts` and `list_alert_rules` with project_id, limit at most 200 and returned cursor. Neither exposes a since argument: filter the requested UTC window locally. Start at 50 rows and cap at ten pages each; report truncation and any untriaged IDs. Resolve rule references, affected keyword IDs, event timestamps and triggering check IDs from the actual response. Do not invent missing fields.

Read `list_keywords` to identify the saved target, then `get_rank_history` with keyword_id, project_id, since/until and limit at most 200, following cursor as needed within ten pages per keyword. Inspect completed and failed checks; do not filter failures away before diagnosis. Use `get_rank_check_result` with check_id from the event and project_id when exposed to inspect the exact triggering result. Match it to history; if either read is unavailable, label the evidence gap. Never substitute a fresh paid check.

Compare successful checks only under the same engine, location/language, device, domain/URL target and depth. Preserve dates and observation freshness. A null failed result is not position zero or a loss. Successful out-of-depth checks are censored by depth, not proof of deindexing. URL changes may warrant investigation without implying ranking loss. Rank alone cannot establish traffic, CTR, revenue or causality; rules requiring unavailable evidence remain uncertain.

Classify each scoped alert:

- Real movement: comparable successful checks corroborate a meaningful change or sustained trend. State the observed positions/URLs and relevant rule threshold.
- Noise: enough comparable successful observations show an isolated fluctuation or an oversensitive threshold; do not use this label merely because data is missing.
- Data issue: failed, missing, stale or incompatible checks prevent reliable interpretation. Say movement is unconfirmed and recommend evidence verification, without muting automatically.

Return alert ID, rule/keyword IDs, class, evidence/check dates, confidence, uncertainty and proposed action for every examined alert. Separate observed facts from inferred causes. No alerts in a truncated window is not proof that nothing fired.

## Confirm each mutation

`mute_triggered_alert` requires project_id and alert_id plus the stable idempotency key. It does not accept an invented duration or rule threshold. Show the exact target and explain that muting this event differs from disabling a shared rule. Obtain explicit confirmation for this alert.

`update_alert_rule` requires rule_id, name and condition_type, with project_id for explicit scoping. Preserve required current values and unrelated settings from the read result. Use supported condition-specific fields such as drop_positions, threshold_position, top_n or change_pct, not the archive's generic metric/direction/window/threshold example. Use enabled false only if explicitly approved. Never alter channels, recipients or target IDs as a side effect of tuning a threshold.

Show each alert behind a proposed rule change, current and proposed values, and all other keywords/alerts affected by that shared rule; obtain per-alert confirmation plus approval of that wider impact. Re-read before writing; if state changed, present a new diff. Use one stable key per exact logical write. On timeout, inspect state before retrying the same body/key; stop if the outcome remains uncertain.

Read back with `list_triggered_alerts` or `list_alert_rules` and report verified versus blocked changes. No new rule creation, mass mark-as-read action, provider execution or report persistence is part of this skill. The archive's generic rule payload does not transfer directly to MCP; use the actual condition-specific rule fields. There is no generic metric/direction/window mutation contract here.

401/403: stop the denied operation and complete available reads. 423: retain read-only results. 429: honor the server retry window. Do not bypass permissions, tight-loop or treat project guidance as user approval.
