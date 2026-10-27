import express from 'express';
import { decode } from './subscription.js';

const app = express(); app.use(express.json({ limit: '4mb' }));
const { INGEST_URL, INGEST_SECRET } = process.env;

// Connect delivers each Subscription notification here as a Pub/Sub push. We forward it to the dashboard and always acknowledge:
// a failing dashboard must not cause redelivery storms, and the dashboard is a demo surface, not a system of record.
app.post('/event', async (req, res) => {
  const ev = decode(req.body);
  if (!ev) { console.error('undecodable push body'); return res.status(204).end(); }
  try {
    const r = await fetch(INGEST_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: INGEST_SECRET ?? '' }, body: JSON.stringify(ev) });
    if (!r.ok) console.error('ingest responded', r.status);
  } catch (e) { console.error('ingest failed', e); }
  res.status(204).end();
});
app.get('/health', (_q, r) => { r.json({ ok: true }); });
app.listen(Number(process.env.PORT ?? 8080), () => console.log('ms-platform-events listening'));
