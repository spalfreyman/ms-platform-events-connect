import { api } from './ct.js';

// Sparks is an external loyalty platform in the M&S target architecture (out of commercetools scope). This consumer plays that
// role: it reacts to OrderCreated, advances activated "spend to earn" offers and credits the wallet. Rewards for fashion, home and
// beauty stay pending for 14 days. Processing is idempotent per order.
export const EARN_OFFERS = [
  { id: 'fhb-10-40', title: 'Earn £10 reward', subtitle: 'Spend £40 on M&S fashion, home and beauty', target: 4000, reward: 1000, bucket: 'fhb' },
  { id: 'flowers-5', title: 'Earn £5 reward', subtitle: 'Buy online flowers and plants', target: 1, reward: 500, bucket: 'flowers' },
];
const CONTAINER = 'ms-sparks';
const money = (x: any) => x?.centAmount ?? 0;
const GBP = (c: number) => ({ currencyCode: 'GBP', centAmount: c });

export function spendByBucket(order: any, departments: Record<string, string>) {
  const spend: Record<string, number> = { fhb: 0, flowers: 0 };
  for (const li of order.lineItems ?? []) {
    const alcohol = li.variant?.attributes?.some((a: any) => a.name === 'ageRestriction' && (a.value?.key ?? a.value) === '18');
    if (alcohol || li.lineItemMode === 'GiftLineItem') continue;
    const d = departments[li.productId] ?? '';
    const bucket = ['Flowers', 'Plants'].includes(d) ? 'flowers' : ['Food', 'Wine'].includes(d) ? 'food' : 'fhb';
    if (bucket in spend) spend[bucket] += li.totalPrice.centAmount;
  }
  return spend;
}

export function applySpend(state: any, spend: Record<string, number>, orderId: string, now = Date.now()) {
  state.processedOrders = state.processedOrders ?? [];
  if (state.processedOrders.includes(orderId)) return { state, awards: [], walletAdd: 0, pendingAdd: 0, duplicate: true };
  const awards: { text: string; amount: number }[] = []; let walletAdd = 0; let pendingAdd = 0;
  for (const def of EARN_OFFERS) {
    const a = state.activated?.[def.id]; if (!a || a.done || new Date(a.expires).getTime() < now) continue;
    const add = spend[def.bucket] ?? 0; if (!add) continue;
    a.progress += add;
    if (a.progress >= def.target) {
      a.done = true;
      if (def.bucket === 'fhb') { state.pending = [...(state.pending ?? []), { amount: def.reward, releaseAt: new Date(now + 14 * 864e5).toISOString(), offerId: def.id }]; pendingAdd += def.reward; }
      else walletAdd += def.reward;
      state.history = [{ at: new Date(now).toISOString(), text: `${def.title}: ${def.subtitle}`, amount: def.reward }, ...(state.history ?? [])];
      awards.push({ text: def.subtitle, amount: def.reward });
    }
  }
  state.processedOrders = [orderId, ...state.processedOrders].slice(0, 50);
  return { state, awards, walletAdd, pendingAdd, duplicate: false };
}

export async function processOrder(orderId: string) {
  const o = (await api('GET', `/orders/${orderId}`)).json;
  if (!o?.customerId) return 'guest order';
  const c = (await api('GET', `/customers/${o.customerId}`)).json;
  if (!c?.custom?.fields?.sparksMember) return 'not a Sparks member';
  const cur = await api('GET', `/custom-objects/${CONTAINER}/${o.customerId}`);
  const state = cur.status === 200 ? cur.json.value : { activated: {}, pending: [], history: [] };
  const ids = [...new Set((o.lineItems ?? []).map((l: any) => l.productId))] as string[];
  const pr = ids.length ? (await api('GET', `/product-projections?limit=100&where=${encodeURIComponent(`id in (${ids.map((i) => JSON.stringify(i)).join(',')})`)}`)).json : { results: [] };
  const deps = Object.fromEntries((pr.results ?? []).map((p: any) => [p.id, p.masterVariant.attributes.find((a: any) => a.name === 'department')?.value ?? '']));
  const r = applySpend(state, spendByBucket(o, deps), o.id);
  if (r.duplicate) return 'already processed';
  const w = await api('POST', '/custom-objects', { container: CONTAINER, key: o.customerId, value: r.state, ...(cur.status === 200 ? { version: cur.json.version } : {}) });
  if (w.status >= 300) throw new Error(`Sparks state write failed ${w.status}`);
  if (r.walletAdd || r.pendingAdd) {
    const f = c.custom.fields;
    const u = await api('POST', `/customers/${c.id}`, { version: c.version, actions: [
      { action: 'setCustomField', name: 'sparksWalletBalance', value: GBP(money(f.sparksWalletBalance) + r.walletAdd) },
      { action: 'setCustomField', name: 'sparksPendingBalance', value: GBP(money(f.sparksPendingBalance) + r.pendingAdd) }] });
    if (u.status >= 300) throw new Error(`Sparks wallet update failed ${u.status}`);
  }
  return `awards: ${r.awards.map((a) => a.amount).join(',') || 'none'}`;
}
