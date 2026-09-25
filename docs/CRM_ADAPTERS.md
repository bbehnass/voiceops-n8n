# Adapting to your CRM

Only **`10-crm-adapter`** talks to the CRM. Everything else sends canonical operations.

## Operations contract

| op | payload | returns (per item) |
|---|---|---|
| `noop` | — | `{ ok: true, skipped: true, fields: {} }` |
| `get_record` | `{ id, fields[] }` | `{ ok, status_code, id, fields, error }` |
| `update_record` | `{ id, fields{} }` | `{ ok, status_code, id, error }` |
| `log_activity` | `{ contact_id, campaign_key, run_name, outcome_label, summary, note, started_at, duration_secs, conversation_id }` | `{ ok, status_code, id, error }` |
| `search_activities` | `{ run_name }` **or** `{ subject_prefix, campaign_key, since }` | `{ ok, count, activities[] }` |

Rules: one op kind per call; one search per call (use Execute Workflow mode *each* for several).

## What ships

### Zoho CRM
- Activities → `Calls` module; link via `Who_Id` (Contacts/Leads) or `What_Id` (Accounts/Deals) — set `crm.link_field`.
- Campaign/run encoded in `Subject` (Zoho search on custom fields is fine too — swap the criteria).
- Summary + recording link go into the Call's `Description`: **one write per outcome**, no second note request to fail.
- Search: `/search?criteria=…`, paginated by `page` until `info.more_records` is false.
- Credential: OAuth2 (tokens expire hourly — don't use a static header).
- Limits worth knowing: search returns at most 2,000 records per criteria; keep criteria to 1–2 conditions and filter the rest in code.

### HubSpot
- Activities → `calls` object, associated to the contact (association type `194`).
- Create custom call properties for `outcome`, `summary`, `campaign_key`, `campaign_run`, `contact_ref` (names in `crm.fields`). `contact_ref` avoids an association lookup per search result.
- Search: `POST /crm/v3/objects/calls/search`, cursor `after` in the body.
- Credential: Header Auth `Authorization: Bearer <private app token>`.

### Generic REST (your own backend, Airtable proxy, Supabase edge function…)
```
GET    /contacts/:id?fields=a,b          → { id, fields:{…} }
PATCH  /contacts/:id                     → { id }
POST   /activities                       → { id }                  body = log_activity payload
GET    /activities?run_name=…&page=1     → { data:[activity…], info:{ page, more_records } }
```

## Adding a provider (≈30 minutes)

1. In **Build request**, add `if (p === 'pipedrive') …` for each op.
2. If its search pagination is neither `page` nor body-cursor, add a sixth branch to the switch with its own HTTP node.
3. In **Normalize record / search**, map its response to the canonical shape.
4. Set `CRM_PROVIDER` and `CRM_BASE_URL`, attach the right credential to the four HTTP nodes.

Nothing else changes — dispatcher, sweeper, retry and KPIs keep working.

## Triggering from the CRM

The dispatcher accepts:
```json
POST /webhook/voiceops/campaigns/dispatch
Header: X-Webhook-Token: <shared secret>
{ "campaign_key": "no_show_recovery",
  "recipients": [ { "id": "123", "name": "Alex Doe", "phone_number": "07700 900123", "email": "a@example.com" } ] }
```
Use `/campaigns/cascade` for multi-touch campaigns. Examples for Zoho (Deluge schedule), HubSpot (workflow webhook) and plain cron + SQL are in [`../examples/crm-triggers/`](../examples/crm-triggers/).

Keep the **selection logic** (who is due today) in the CRM or warehouse — that's where the data lives. Keep the **"still true right now?"** check in the dispatcher's eligibility rules.
