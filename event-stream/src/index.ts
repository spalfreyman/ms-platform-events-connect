import express from 'express';
import { decode } from './subscription.js';
import { handOff } from './oms.js';
import { processOrder } from './sparks.js';

const app = express(); app.use(express.json({ limit: '4mb' }));
const { INGEST_URL, INGEST_SECRET, OMS_URL, OMS_SECRET } = process.env;

// Every Subscription notification arrives here as a Pub/Sub push.
// 1) it is forwarded to the live dashboard (best effort);
// 2) OrderCreated is handed to the OMS and to the Sparks loyalty consumer. If either fails the event is NOT acknowledged,
//    so Connect redelivers it; both handlers are idempotent, so redelivery is safe.
app.post('/event', async (req, res) => {
  const ev = decode(req.body);
  if (!ev) { console.error('undecodable push body'); return res.status(204).end(); }
  try {
    const r = await fetch(INGEST_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: INGEST_SECRET ?? '' }, body: JSON.stringify(ev) });
    if (!r.ok) console.error('ingest responded', r.status);
  } catch (e) { console.error('ingest failed', e); }
  const p: any = ev.payload;
  if (p?.notificationType === 'Message' && p.type === 'OrderCreated' && p.resource?.id) {
    try {
      const [oms, sparks] = await Promise.all([OMS_URL ? handOff(p.resource.id, OMS_URL, OMS_SECRET ?? '') : 'no OMS configured', processOrder(p.resource.id)]);
      console.log('OrderCreated', p.resource.id, '| OMS:', oms, '| Sparks:', sparks);
    } catch (e) { console.error('OrderCreated processing failed, will be redelivered:', e); return res.status(503).end(); }
  }
  res.status(204).end();
});
app.get('/health', (_q, r) => { r.json({ ok: true }); });
app.listen(Number(process.env.PORT ?? 8080), () => console.log('ms-platform-events listening'));
