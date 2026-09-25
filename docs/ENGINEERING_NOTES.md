# Engineering notes

Lessons that shaped this design. Each one is a bug class that is easy to ship in low-code automation and hard to notice once live.

## 1. Item pairing is the #1 silent bug in batch flows
In n8n, `$('Node').first()` inside a per-item flow returns the **first** person's data for **every** person. Nothing errors; 199 of 200 people just get the wrong A/B arm, the wrong eligibility result, or the wrong checklist read out to them.

**Rule here:** per-item logic runs in *all-items* Code nodes that pair by index explicitly and **throw on length mismatch** (`Evaluate eligibility`, `Build daily rows`). Test with realistic batch sizes — a 1-item test can't catch this.

## 2. Compute it fresh, then actually use the fresh value
A classic follow-up bug: re-check a record, compute an updated to-do list… and send the list captured at trigger time. The dispatcher builds `action_items_list` from the live evaluation, in the same node that builds the request.

## 3. Don't hand-write JSON bodies
`"name": "{{ $json.name }}"` breaks on the first apostrophe or newline and can inject fields. Every body here is an object expression (`={{ $json.body }}`), built in code.

## 4. Webhooks get lost — design for it
Some calls never produce a post-call event. A fixed "wait 30 minutes" isn't enough for large batches (dialling can take longer) and too long for small ones. The sweeper **polls the batch status**, adds a grace period, then backfills `Failed` records — scoped to **this run**, because a record from another campaign must not hide a failure in this one.

## 5. Verify the bytes you parse
HMAC must be computed over the raw body as received. Then parse **those** bytes — not a framework's re-serialized copy — and reject stale timestamps to stop replays.

## 6. "The agent said booked" ≠ booked
The LLM can agree to a slot that was taken a minute ago. Success is `201 Created` from the calendar API; anything else is recorded as `Booking failed` with the API's reason, which is also what makes the KPI trustworthy.

## 7. Deterministic experiments
`hash(salt:id) % 100` gives the same arm on every run, on every server, after every restart — no state to store. A per-experiment salt keeps experiments independent. Write the arm back to the CRM so the control group is measurable.
Watch out: most CRMs **replace** multi-select arrays on update. If the A/B field holds other values, read-merge-write.

## 8. Check eligibility at dial time, not trigger time
Hours or days can pass between "selected" and "dialled" (cascades, retries, queue delays). Every touch and every retry goes back through the dispatcher's live rule check.

## 9. One activity per attempt, one write per activity
Logging each attempt (with summary + recording in the same record) makes retries, sweeps and KPIs all simple queries on one object. A second "add note" request is a second chance to fail halfway.

## 10. Know your CRM's query limits
Zoho search/COQL behave badly with many AND conditions and cap result counts; HubSpot search paginates with a body cursor. Keep criteria minimal and filter the rest in code — and keep that knowledge inside the adapter.

## 11. Configuration is data; copy-paste is debt
Four near-identical KPI workflows and one post-call workflow per use case were replaced by one parameterized workflow each. New use case = new config object.

## 12. Verify live, don't trust documentation
Field names, picklist values and status strings drift from whatever is written in tickets or docs. Before relying on a value, read it from a real record. That habit is why every mapping in this repo lives in one config file you can check against your system in minutes.

## 13. Keys never go to the browser
An internal HTML tool with an API key in its source is a public API key. The console talks only to the gateway; the gateway holds credentials and allow-lists actions.

## 14. Watch out for tooling side-effects
Pushing workflows programmatically (API/MCP) can reset credentials on HTTP nodes, flip execution order, or clear per-node flags. After any automated push: re-attach credentials, confirm `executionOrder`, check Code node modes, and re-publish.
