#!/usr/bin/env node
// Send a correctly signed test post-call webhook to the router.
// usage: VOICE_WEBHOOK_SECRET=... node scripts/sign-test-webhook.js <url> <payload.json> [--tamper]
const crypto = require('crypto'); const fs = require('fs');
const [url, file, flag] = process.argv.slice(2);
const secret = process.env.VOICE_WEBHOOK_SECRET;
if (!url || !file || !secret) { console.error('usage: VOICE_WEBHOOK_SECRET=... node sign-test-webhook.js <url> <payload.json> [--tamper]'); process.exit(1); }
const raw = fs.readFileSync(file, 'utf8');
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
const body = flag === '--tamper' ? raw.replace('Booked', 'Refused') : raw;
fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ElevenLabs-Signature': `t=${t},v0=${sig}` }, body })
  .then(async r => console.log(r.status, await r.text()))
  .catch(e => { console.error(e); process.exit(1); });
