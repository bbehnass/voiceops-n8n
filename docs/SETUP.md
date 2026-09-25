# Setup

## 1. Requirements
- n8n 1.x (self-hosted or cloud). Code nodes use Luxon (`DateTime`), available by default.
- A voice platform account with batch calling + post-call webhooks (ElevenLabs Conversational AI).
- A CRM (Zoho / HubSpot / your REST API), a Calendly account for booking campaigns, an Anthropic API key and a Google Sheet for the QA loop.

## 2. Import
```bash
n8n import:workflow --separate --input=workflows/
```
The CLI keeps the fixed workflow IDs (`vopsDispatcher00`, …) so every *Execute Workflow* link resolves.
Imported through the UI instead? IDs get regenerated — run:
```bash
python3 scripts/relink.py workflows/ id-map.json   # {"vopsDispatcher00": "<new id>", …}
```
then re-import, or update the *Execute Workflow* nodes by hand (they are listed by the script).

## 3. Environment variables
Copy `config/.env.example`, fill it in, and start n8n with it. If your host blocks `$env` in Code nodes, paste the values directly into `00-config` (never commit them).

## 4. Credentials (create in n8n, then select on the nodes)

| Credential | Type | Used by |
|---|---|---|
| **Voice API** | Header Auth — name `xi-api-key`, value = key | HTTP nodes calling `voice.base_url` (20, 30, 40, 60, 61) |
| **CRM** | OAuth2 (Zoho) or Header Auth `Authorization: Bearer …` (HubSpot) | the 4 HTTP nodes in 10 — switch *Generic Auth Type* if needed |
| **Calendly** | Bearer Auth | 11 |
| **Anthropic** | Header Auth — name `x-api-key` | *LLM review* (60), *LLM rewrite* (61) |
| **Google Sheets** | OAuth2 | Sheets nodes in 60, 61 |
| **Dispatch webhook** | Header Auth — e.g. `X-Webhook-Token` | CRM trigger nodes in 20, 21 |
| **KPI ingest** | Header Auth | *Post to dashboard* (50) |

## 5. Configure `00-config`
- `crm.provider`, `link_field`, and the `fields` map → **check each name against a real record**.
- One object per campaign: agent id, timezone, booking, A/B, eligibility, retry, KPI.
- Error workflow: every workflow already points to `90-error-notifier`.

## 6. Voice platform
- Post-call webhook → `https://<n8n>/webhook/voiceops/voice/post-call`, HMAC on, secret in `VOICE_WEBHOOK_SECRET`.
- Agents' data collection as in [`VOICE_AGENT_CONTRACT.md`](VOICE_AGENT_CONTRACT.md).

## 7. Test, smallest first
1. **Router:** `node scripts/sign-test-webhook.js https://<n8n>/webhook-test/voiceops/voice/post-call examples/post-call-webhook.sample.json` → expect `200`; change one byte → expect `401`.
2. **Dispatcher:** send `examples/dispatch-request.sample.json` to the *test* URL with **your own phone number** as the only recipient.
3. **Sweeper:** dispatch to a number that won't answer; confirm a `Failed` or `Voicemail` activity appears for the run.
4. **KPI:** *Run now* on 50 with `KPI_INGEST_URL` pointing to a request bin.
5. **QA:** open the console, Settings → gateway URL + token, untick demo, run on 2–3 calls.

Then scale up (10 → 50 → full lists). Item-pairing bugs only show at realistic batch sizes.

## 8. Operating
- Search executions by `run_name` / `contact_id` (saved as execution data).
- Alerts arrive on any thrown error — unknown campaign, CRM rejection, no availability, bad config.
