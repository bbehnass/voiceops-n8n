# HubSpot trigger

HubSpot workflows send one webhook per enrolled record. Two options:

1. **Per-record** (simple): Workflow → *Send a webhook* (POST) to a tiny n8n "collector" that appends the contact to a queue (Sheet / Data Table), plus a scheduled n8n workflow that drains the queue into **one** dispatcher call per campaign. Batching keeps you on the voice platform's batch API.
2. **Scheduled search** (no workflow): an n8n schedule runs a HubSpot contact search for today's criteria and posts `{ campaign_key, recipients }` to the dispatcher.

Map `id` → `hs_object_id`, `phone_number` → `mobilephone`/`phone`, `name` → `firstname`.
