# Workflows, node by node

Conventions used everywhere:
- Every workflow starts with **Load config** (calls `00`, `executeOnce`).
- Nodes reference upstream data **by node name** (`$('Resolve run').first()`), never the ambient `$json` after a branch or sub-workflow call.
- HTTP bodies are **object expressions** (`={{ $json.body }}`), never hand-written JSON strings.
- Sub-workflows use the *passthrough* trigger: callers send items, the sub-workflow returns items.

---

## 00 · Config
One Code node returning the `CONFIG` object. Secrets are read with a guarded `$env` helper so the same file works on hosts where env access is blocked (you then paste values or use n8n Variables).

Key sections: `crm`, `voice`, `webhooks`, `safety_net`, `alerts`, `kpi`, `qa`, `defaults`, `campaigns`.

A campaign:
```js
rental_documents: {
  label: 'Rental Documents',           // run-name prefix
  agent_id, timezone, locale, default_country_code,
  booking:     { enabled, event_type_uri, lookahead_days, max_slots_offered },
  ab_test:     { enabled, treatment_pct, salt, crm_field, multi_select, labels },
  eligibility: { status_field, allowed_statuses, checklist[], min_open_items, min_started_items },
  cascade:     { touch_offsets_days: [0,3,7], skip_weekends, send_hour },
  retry:       { enabled, retry_on[], max_retries, delay_minutes },
  kpi:         { enabled, success_outcomes[], realization: { field, truthy[] } },
  outcome_keys, outcome_aliases, outcome_labels, handler_workflow_id   // optional overrides
}
```

## 10 · CRM Adapter
**Input:** items `{ op, payload }` (one kind of op per call). **Output:** same count, same order.

| Node | What / why |
|---|---|
| Build request | Maps op → `{ method, url, qs, body, kind }` per provider. Refuses mixed ops (index alignment is the contract). Escapes Zoho criteria specials. |
| Route by request kind | Expression switch: skip / read / write / search-by-page / search-by-cursor. |
| CRM read / write | Full response + never-error so failures become data (`ok:false`) instead of killing a 200-person batch. Batched 10/s. |
| CRM search (page param) | Zoho & generic: `page` query param until `info.more_records` is false. |
| CRM search (cursor in body) | HubSpot search: `after` in the body until `paging.next` disappears. |
| Normalize record / search | Canonical `{ ok, status_code, id, fields, error }` / `{ activities[] }`. |

## 11 · Calendar Tools
`noop` · `availability` (Calendly available times, ≤7-day window, `available` only) · `book` (fetch event location → create invitee → **ok only if 201**).

## 20 · Campaign Dispatcher
Triggers: authenticated webhook (from the CRM) **or** internal call (cascade/retry) — both flow into the same pipeline.

| Node | What / why |
|---|---|
| Normalize trigger | Validates shape, reads `run_name`, `touch_label`, `attempt`, `skip_ab`. |
| Resolve run | Loads the campaign, builds the run name in the campaign timezone, normalizes phones to **E.164** with the campaign's country code, dedupes, records rejects. |
| Tag execution | Saves run/campaign as execution metadata → searchable in n8n's execution list. |
| Assign A/B arm | FNV-1a hash of `salt:id` → bucket 0–99. Same person, same arm, forever; different salt per experiment. |
| Build A/B tag writes → adapter | Writes the arm to the CRM so the control group can be measured later. Runs as a side branch. |
| Treatment arm only | Control group is never called. |
| Build eligibility lookups → adapter → Evaluate eligibility | Live record fetch per person, then the rule engine: status gate, checklist with `any_of`, exemptions, per-item accepted values, sub-state labels, thresholds. Produces the **fresh** `action_items` list the agent reads out. Pairs strictly by index and throws on mismatch. |
| Collect batch | Stops quietly when nobody is left. |
| Get real availability | Only for booking campaigns; dispatcher **throws** rather than call people with nothing to offer. |
| Build batch payload | Shared + per-recipient dynamic variables, human slot strings in the campaign locale/timezone. |
| Submit batch call → Start sweeper | Sweeper is started asynchronously with the batch id and the full recipient list. |

## 21 · Multi-touch Cascade
`Plan touches` turns `touch_offsets_days` into send times (campaign timezone, `send_hour`, weekend-skipped) → a **SplitInBatches loop** → `Wait until send time` → `Dispatch touch` (sub-workflow, waits for completion, `alwaysOutputData` so an empty touch doesn't stall the loop).
Every touch re-enters the dispatcher, so people who resolved their situation drop out automatically.

## 30 · Post-call Router
| Node | What / why |
|---|---|
| Post-call webhook | `rawBody: true`, respond via node. |
| Read raw body | The **exact** bytes that were signed. |
| Parse signature header | `t=…,v0=…` → signed payload `${t}.${raw}`, freshness check (`max_age_secs`). |
| HMAC-SHA256 → Verify signature | Compare, then `JSON.parse` the raw bytes (parse what you verified). |
| Valid? → 200 / 401 | Fast acknowledgement; rejects are visible to the sender. |
| Resolve campaign | Ignores non-transcription events; reads `campaign_key`/`run_name` from the call's own variables. |
| Get batch details → Match by name | Fallback for calls dispatched without variables (longest label prefix wins). |
| Pick handler → Run outcome handler | Per-campaign override or the generic handler. Unknown campaign **throws**. |

## 31 · Outcome Handler
`Normalize outcome` (configurable data-collection keys, aliases, voicemail inferred from termination reason, contact id required) → `Calendar request` (agent's local time → UTC in the campaign timezone; invalid slot detected) → `Book if needed` → `Finalize outcome` (Booked vs **Booking failed** with the calendar's reason; summary; note with recording link) → `Log activity in CRM` → `Assert written` (throws on CRM rejection).

## 40 · Silent-failure Sweeper
`Initial delay` → `Get batch status` ⇄ `Poll again` until `completed|failed|cancelled` or `max_polls` → `Grace period` → search activities **for this run only** → anyone dialled without one gets a `Failed` activity → `Retry decision` (bounded by `max_retries`) → `Schedule retry` (async).

## 41 · Retry Scheduler
Waits `retry.delay_minutes` → reads this run's activities → keeps people whose **latest** attempt is retryable → dispatches `"{run} (Retry n)"` with `skip_ab` (arm already assigned). Eligibility is re-checked by the dispatcher.

## 50 · KPI Aggregator
Nightly + manual. One adapter search per KPI-enabled campaign (mode *each*), then per campaign per local day: total, first attempts vs retries, connected, successes, outcome histogram, and optional **realization** (e.g. booked → attended) via a record lookup. Test runs excluded. Posts rows to `KPI_INGEST_URL`.

Row:
```json
{ "campaign_key":"missed_appointment","date":"2026-09-24","total":3,"first_attempts":2,"retries":1,
  "connected":2,"successes":1,"realized":1,"connect_rate_pct":66.7,"success_rate_pct":50,
  "realization_rate_pct":100,"outcomes":{"booked":1,"voicemail":1,"refused":1} }
```

## 60 · QA Analysis Pipeline
See [`QA_TOOL.md`](QA_TOOL.md).

## 61 · QA API Gateway
One POST endpoint `{ token, action, params }`. Actions: `list_agents`, `get_agent`, `list_conversations`, `start_analysis`, `job_status`, `scores`, `rewrite_prompt`, `mark_prompt_deployed`, `log_client_error`. Input validation and token check happen in one place (`Route request`); every branch ends in its own response node.

## 90 · Error Notifier
Set as the error workflow of every other workflow. Posts `{ text }` to `ALERT_WEBHOOK_URL` (Slack/Teams-compatible).
