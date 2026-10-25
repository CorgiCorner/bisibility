# Retained local map evidence

Confirm one project and one Local monitor. The monitor id is `lmn_...`. If the user did not supply it and no prior result returned it, stop. Setting up a monitor and starting a run happen in the app. This skill does not create schedules or launch runs.

## Read-only tools

| Tool | Use |
| --- | --- |
| `list_projects` | Resolve the project when the domain is ambiguous. |
| `get_project_context` | Read saved business, audience, products, goals and agent rules. Missing context is a labeled assumption. |
| `list_competitors` | Read saved rival domains. They are context, not proof of who wins a map point. |
| `list_local_monitor_runs` | Read retained runs for one monitor. Requires `project_id` and `monitor_id`. |
| `get_local_monitor_run_results` | Read one retained run: points, grids, freshness and the receipt. Requires `run_id`. |
| `list_local_monitor_point_listings` | Read listings for one captured point. Requires `target_id` (`lmt_...`). |
| `list_local_monitor_point_history` | Read history for that same captured point. |
| `export_local_monitor_run` | Download normalized retained JSON for one run. Optional `version` is `1`. |

Every one of these Local tools is read-only retained evidence. None of them launches provider work, creates a schedule or writes accounting. Do not add `estimate_only`, `fresh` or `max_cost_cents`. Those arguments are not on these tools. There is no paid call to approve.

`as_of`, `from` and `to`, when used, are UTC timestamps with milliseconds, for example `2026-10-16T09:00:00.000Z`. `to` is not later than `as_of`. Preserve a returned cursor exactly. Do not edit it.

## What a listing contains

A Local monitor listing can include the business name, `rank_group`, `rank_absolute`, promotion (`organic`, `promoted` or `unknown`), observation time, match status (`confirmed`, `candidate`, `rejected` or `unavailable`), `cid` and `place_id`.

Record a website, domain, Maps URL, rating or review count only when that field is present on the retained item. Local monitor listings may omit them. Local-pack rank checks elsewhere can keep rating and review count. This skill does not launch those checks to fill the gap. Absence is unknown, not a score of zero and not a broken profile.

Match the project's own listing in this order: a website or domain field when present and equal to the project domain, then `cid` or `place_id` when the user or context supplied that identifier, then `matched: confirmed` on the retained row. A name that merely looks similar is not a match. Label `candidate` and `unavailable` as unresolved.

## Zones and trend

Use the run's grid counts and point positions. A strong zone is where the matched project listing has a better retained rank than the compared rivals. A weak zone is where a rival outranks it or the project listing is known absent inside the returned depth. Unknown, failed, stale and never-checked points stay in their own bucket. Do not average them into a rank.

History is comparable only for the same captured `target_id`, with compatible keyword, device and definition. State the two observation times and the age between them. If definition revisions differ, say the trend is not comparable. Report `freshness`, `freshness_reason`, coverage counts and receipt fields exactly as returned, including `financial_state`, `accounting_pending` and reconciliation reasons. Do not translate an unknown receipt into a currency amount.

## Actions and profile limits

Lead with at most three actions tied to a weak zone, a rival that wins there, or a coverage gap. Each action names evidence ids, confidence, uncertainty and a verification step. Re-checking the next scheduled run is a valid verification. It is not permission to launch that run.

Bisibility does not read the business's own Google Business Profile. It has no tool for categories, hours, description, photos, posts, questions and answers, review text or profile completeness. Any profile idea is a suggestion for the user to verify manually. It is not an audit finding and cannot be the only basis of a high-confidence action.

## Schema-checked example calls

Illustrative ids only. Replace them with ids the tools return. These calls do not spend provider budget.

```json mcp-call
{
  "tool": "list_local_monitor_runs",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "monitor_id": "lmn_a00000000000000000000000",
    "as_of": "2026-10-16T09:00:00.000Z"
  }
}
```

```json mcp-call
{
  "tool": "get_local_monitor_run_results",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "monitor_id": "lmn_a00000000000000000000000",
    "run_id": "lmr_b00000000000000000000000",
    "as_of": "2026-10-16T09:00:00.000Z"
  }
}
```

```json mcp-call
{
  "tool": "list_local_monitor_point_listings",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "monitor_id": "lmn_a00000000000000000000000",
    "run_id": "lmr_b00000000000000000000000",
    "target_id": "lmt_c00000000000000000000000",
    "as_of": "2026-10-16T09:00:00.000Z"
  }
}
```

```json mcp-call
{
  "tool": "list_local_monitor_point_history",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "monitor_id": "lmn_a00000000000000000000000",
    "run_id": "lmr_b00000000000000000000000",
    "target_id": "lmt_c00000000000000000000000",
    "as_of": "2026-10-16T09:00:00.000Z"
  }
}
```

```json mcp-call
{
  "tool": "export_local_monitor_run",
  "arguments": {
    "project_id": "prj_a00000000000000000000000",
    "monitor_id": "lmn_a00000000000000000000000",
    "run_id": "lmr_b00000000000000000000000",
    "as_of": "2026-10-16T09:00:00.000Z",
    "version": "1"
  }
}
```
