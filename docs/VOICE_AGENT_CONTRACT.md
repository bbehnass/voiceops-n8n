# Voice agent contract

What an agent must accept and return for the pipeline to work. Written for ElevenLabs ElevenAgents; any platform with batch calling, dynamic variables, structured post-call extraction and signed webhooks can implement it.

## Dynamic variables sent with every call

| Variable | Example | Use in the prompt |
|---|---|---|
| `contact_name` | `Alex` | Greeting |
| `contact_email`, `contact_phone` | | Confirmation / booking |
| `today`, `tomorrow` | `Friday 25 September 2026` | Resolving "tomorrow at 3" |
| `next_availabilities` | `Monday 28 September at 14:00, …` | Booking campaigns — **offer only these** |
| `action_item_count`, `action_items_list` | `2` / `1. Proof of income\n2. Guarantor form` | Checklist campaigns (fresh at dial time) |
| `campaign_key`, `run_name`, `contact_id` | | Not for the agent — used for routing and reconciliation. Don't mention them. |
| anything in `recipient.variables` | | Your own extras |

## Structured data the agent must extract (post-call analysis)

| Key (configurable in `defaults.outcome_keys`) | Type | Values |
|---|---|---|
| `call_outcome` | enum | `booked`, `refused`, `voicemail`, `callback_requested`, `confirmed`, `completed`, `failed` (add your own + labels) |
| `scheduled_datetime_iso` | string | Local wall-clock ISO, e.g. `2026-09-28T14:00:00` — interpreted in the campaign timezone |
| `refusal_reason` | string | Free text, used as the summary for refusals |

Describe each field precisely in the agent's data-collection settings — e.g. *"`booked` only if the caller explicitly agreed to one of the offered slots"*. The rationale the platform returns becomes the CRM summary.

## Webhook

- Post-call **transcription** webhook → `…/webhook/voiceops/voice/post-call`
- HMAC signing enabled; put the secret in `VOICE_WEBHOOK_SECRET`.
- Configure it on **each agent** if your platform scopes webhooks per agent — a new agent without it is the most common reason "no outcomes are coming back".

## Prompt tips that the QA loop tends to surface

- Offer at most 2–3 slots at a time even if more are available.
- Explain domain terms in one plain sentence the first time they come up.
- Put exit conditions (busy, wrong person, not interested) near the top of the prompt.
- Keep `max_tokens` bounded for the voice LLM; unbounded outputs increase latency.
