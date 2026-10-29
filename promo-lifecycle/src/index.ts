import express from 'express';
import { api } from './ct.js';
import { toNotification, transitions } from './lifecycle.js';

const app = express(); app.use(express.json());
const { INGEST_URL, INGEST_SECRET, CTP_PROJECT_KEY } = process.env;
const META = '/custom-objects/platform-events-meta/promo-lifecycle';

async function windowQuery(path: string, from: string, to: string) {
  const w = `(validFrom > "${from}" and validFrom <= "${to}") or (validUntil > "${from}" and validUntil <= "${to}")`;
  return ((await api('GET', `${path}?limit=500&where=${encodeURIComponent(w)}`)).json.results ?? []) as any[];
}

// Connect's scheduler calls this endpoint on the cron schedule in connect.yaml
app.post('/job', async (_req, res) => {
  try {
    const now = new Date();
    const meta = await api('GET', META);
    const from = meta.status === 200 ? new Date(meta.json.value.lastRun) : new Date(now.getTime() - 10 * 60_000);
    const [pd, cd, codes] = await Promise.all([windowQuery('/product-discounts', from.toISOString(), now.toISOString()), windowQuery('/cart-discounts', from.toISOString(), now.toISOString()), windowQuery('/discount-codes', from.toISOString(), now.toISOString())]);
    const all = [...transitions('product-discount', pd, from, now), ...transitions('cart-discount', cd, from, now), ...transitions('discount-code', codes, from, now)];
    for (const t of all) {
      const payload = toNotification(t, CTP_PROJECT_KEY ?? '');
      await fetch(INGEST_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: INGEST_SECRET ?? '' }, body: JSON.stringify({ payload, messageId: payload.id }) }).catch((e) => console.error('ingest failed', e));
    }
    await api('POST', '/custom-objects', { container: 'platform-events-meta', key: 'promo-lifecycle', value: { lastRun: now.toISOString(), lastCount: all.length }, ...(meta.status === 200 ? { version: meta.json.version } : {}) });
    console.log(`promo-lifecycle ${from.toISOString()} -> ${now.toISOString()}: ${all.length} transition(s)`);
    res.status(200).json({ transitions: all.length });
  } catch (e) { console.error('promo-lifecycle failed', e); res.status(500).end(); }
});
app.listen(Number(process.env.PORT ?? 8080), () => console.log('ms-promo-lifecycle listening'));
