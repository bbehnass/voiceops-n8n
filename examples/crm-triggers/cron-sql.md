# Warehouse / database trigger

```sql
-- who missed yesterday's appointment and has a phone number
select id, first_name as name, mobile as phone_number, email
from contacts
where appointment_status = 'missed' and appointment_date = current_date - 1 and mobile is not null;
```

```bash
# daily 10:00 via cron / GitHub Actions / Cloud Scheduler
psql "$DATABASE_URL" -At -F$'\t' -c "$QUERY" \
 | jq -Rn '{campaign_key:"missed_appointment",recipients:[inputs|split("\t")|{id:.[0],name:.[1],phone_number:.[2],email:.[3]}]}' \
 | curl -sS -X POST "$N8N/webhook/voiceops/campaigns/dispatch" -H "X-Webhook-Token: $TOKEN" -H 'Content-Type: application/json' -d @-
```
