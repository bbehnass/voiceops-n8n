# QA loop: review real calls, fix the prompt, measure the change

```
Console ──start_analysis──▶ Gateway ──(async job)──▶ Pipeline ──▶ voice API (calls, transcripts, agent config)
   ▲                            │                        │
   └──── job_status (poll) ─────┘                        ├──▶ LLM review (rubric, JSON)
                                                         └──▶ Sheets: scores · analyzed_calls · jobs
Console ──rewrite_prompt──▶ Gateway ──▶ LLM ──▶ jobs     (diff shown in Prompt Lab)
Console ──mark_prompt_deployed──▶ prompt_changes         (markers on the Trends chart)
```

## Pipeline steps (workflow 60)

1. **Select** — calls in the window that finished, lasted ≥ `min_duration_secs`, have ≥ `min_messages`, weren't voicemail/silence, and haven't been analyzed (unless *Re-analyze*). Or an explicit list of conversation ids.
2. **Context** — the agent's current config is fetched once; each conversation is fetched in batches of 5/s.
3. **Anonymize** — see below.
4. **Latency** — per-turn LLM TTFB, TTS TTFB, ASR latency → average, p90, count of turns > 1.5 s.
5. **Review** — one request per call. The rubric is a cached system block (paid once per batch); the user block carries prompt, config snapshot, latency and the timestamped transcript. Output is **JSON** — no regex scraping.
6. **Parse** — tolerant JSON extraction, weighted overall score recomputed if missing, truncation flagged, cost computed from usage if prices are configured.
7. **Aggregate** — dimension averages, latency, cost, and **recurring issues** clustered by category + fix fingerprint, sorted by frequency then severity.
8. **Store** — score rows, analyzed ids (dedupe), job result (size-guarded under the 50k-char cell limit).

## Rubric

| Dimension | Weight | Asks |
|---|---|---|
| goal_completion | 30 | Did the call achieve its goal — or correctly conclude it couldn't? |
| flow | 20 | Turn-taking, loops, repeated questions, interruptions |
| accuracy | 20 | Facts, guardrails, no invented promises, variables used correctly |
| tone | 15 | Clear, concise, adapted to non-native speakers |
| technical | 15 | Latency, dead air, talk-over, recognition errors |

Each issue carries `severity`, `category` (prompt / settings / knowledge / tooling), timestamped `evidence`, `root_cause`, `fix`, and either an exact `prompt_patch` or a `setting_change`. Up to 3 combined test scenarios per call.

## Prompt Lab

Pick issues (settings issues are excluded — they're not prompt changes), load the live prompt, generate a revision. The rewrite prompt is constrained: apply only the listed fixes, keep structure and every `{{variable}}`, tighten if > ~8k chars. The console shows a line-level diff; **you** copy it into the agent and click *Mark as deployed*, which drops a marker on the Trends chart so score changes can be attributed.

## Store (Google Sheets)

Create one spreadsheet with these tabs and header rows:

| Tab | Columns |
|---|---|
| `jobs` | job_id, kind, status, created_at, finished_at, params_json, result_json |
| `scores` | analyzed_at, agent_id, agent_name, conversation_id, score, goal_completion, flow, accuracy, tone, technical, duration_secs, llm_avg_ms, tts_avg_ms, asr_avg_ms, issues, cost_usd |
| `analyzed_calls` | conversation_id, agent_id, analyzed_at |
| `prompt_changes` | changed_at, agent_id, note |
| `client_errors` | at, error |

Swapping to Postgres/Supabase/n8n Data Tables means replacing the Sheets nodes only.

## Console

`dashboard/index.html` — one file, no build step. Settings (gateway URL + token) are stored in the browser; **demo mode** runs entirely on synthetic data, so the page can be hosted on GitHub Pages as a live preview.

**Branding.** The `BRAND` block at the top of the file sets the product name, logo (`logoUrl`, also used as the favicon), accent colour and dark-mode accent. Leave a field empty to keep the neutral default.

## Privacy

Before any transcript leaves your infrastructure:
- the contact's known name (from the call's own variables) is replaced with `[NAME]`,
- emails → `[EMAIL]`, phone numbers → `[PHONE]`, UK-style postcodes → `[POSTCODE]`, street addresses → `[ADDRESS]`.

Regex anonymization is a floor, not a guarantee — review the patterns for your languages and add a DPA with your LLM provider. The console never receives provider keys; the gateway token is the only secret the browser holds, and it only opens the gateway's allow-listed actions.
