import { api } from './ct.js';

// Sparks is an external loyalty platform in the M&S target architecture (out of commercetools scope). This consumer plays that
// role: it reacts to OrderCreated, advances activated "spend to earn" offers and credits the wallet. Rewards for fashion, home and
// beauty stay pending for 14 days. Processing is idempotent per order.
// Sparks runs in the UK (GBP) and Ireland (EUR): an order progresses the offer in its own currency and pays the reward into that wallet.
type Cur = 'GBP' | 'EUR';
export const EARN_OFFERS: { id: string; bucket: string; text: Record<Cur, string>; values: Partial<Record<Cur, { target: number; reward: number }>> }[] = [
  { id: 'fhb-10-40', bucket: 'fhb', text: { GBP: 'Earn £10 reward: Spend £40 on M&S fashion, home and beauty', EUR: 'Earn €12 reward: Spend €50 on M&S fashion, home and beauty' }, values: { GBP: { target: 4000, reward: 1000 }, EUR: { target: 5000, reward: 1200 } } },
  { id: 'flowers-5', bucket: 'flowers', text: { GBP: 'Earn £5 reward: Buy online flowers and plants', EUR: '' }, values: { GBP: { target: 1, reward: 500 } } },
];
export const WALLET: Record<Cur, { wallet: string; pending: string }> = { GBP: { wallet: 'sparksWalletBalance', pending: 'sparksPendingBalance' }, EUR: { wallet: 'sparksWalletBalanceEur', pending: 'sparksPendingBalanceEur' } };
const CONTAINER = 'ms-sparks';
const money = (x: any) => x?.centAmount ?? 0;

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

export function applySpend(state: any, spend: Record<string, number>, orderId: string, now = Date.now(), cur: Cur = 'GBP') {
  state.processedOrders = state.processedOrders ?? [];
  if (state.processedOrders.includes(orderId)) return { state, awards: [], walletAdd: 0, pendingAdd: 0, duplicate: true };
  const awards: { text: string; amount: number }[] = []; let walletAdd = 0; let pendingAdd = 0;
  for (const def of EARN_OFFERS) {
    const a = state.activated?.[def.id]; const val = def.values[cur]; if (!a || a.done || !val || new Date(a.expires).getTime() < now) continue;
    const add = spend[def.bucket] ?? 0; if (!add) continue;
    // progress per currency; a plain number is from before Ireland and counts as GBP
    if (typeof a.progress !== 'object' || a.progress === null) a.progress = { GBP: a.progress ?? 0 };
    a.progress[cur] = (a.progress[cur] ?? 0) + add;
    if (a.progress[cur] >= val.target) {
      a.done = true; a.currency = cur;
      if (def.bucket === 'fhb') { state.pending = [...(state.pending ?? []), { amount: val.reward, releaseAt: new Date(now + 14 * 864e5).toISOString(), offerId: def.id, currency: cur }]; pendingAdd += val.reward; }
      else walletAdd += val.reward;
      state.history = [{ at: new Date(now).toISOString(), text: def.text[cur], amount: val.reward, currency: cur }, ...(state.history ?? [])];
      awards.push({ text: def.text[cur], amount: val.reward });
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
  const obj = await api('GET', `/custom-objects/${CONTAINER}/${o.customerId}`);
  const state = obj.status === 200 ? obj.json.value : { activated: {}, pending: [], history: [] };
  const ids = [...new Set((o.lineItems ?? []).map((l: any) => l.productId))] as string[];
  const pr = ids.length ? (await api('GET', `/product-projections?limit=100&where=${encodeURIComponent(`id in (${ids.map((i) => JSON.stringify(i)).join(',')})`)}`)).json : { results: [] };
  const deps = Object.fromEntries((pr.results ?? []).map((p: any) => [p.id, p.masterVariant.attributes.find((a: any) => a.name === 'department')?.value ?? '']));
  const cur: Cur = o.totalPrice?.currencyCode === 'EUR' ? 'EUR' : 'GBP';
  const r = applySpend(state, spendByBucket(o, deps), o.id, Date.now(), cur);
  if (r.duplicate) return 'already processed';
  const w = await api('POST', '/custom-objects', { container: CONTAINER, key: o.customerId, value: r.state, ...(obj.status === 200 ? { version: obj.json.version } : {}) });
  if (w.status >= 300) throw new Error(`Sparks state write failed ${w.status}`);
  if (r.walletAdd || r.pendingAdd) {
    const f = c.custom.fields;
    const u = await api('POST', `/customers/${c.id}`, { version: c.version, actions: [
      { action: 'setCustomField', name: WALLET[cur].wallet, value: { currencyCode: cur, centAmount: money(f[WALLET[cur].wallet]) + r.walletAdd } },
      { action: 'setCustomField', name: WALLET[cur].pending, value: { currencyCode: cur, centAmount: money(f[WALLET[cur].pending]) + r.pendingAdd } }] });
    if (u.status >= 300) throw new Error(`Sparks wallet update failed ${u.status}`);
  }
  return `awards: ${r.awards.map((a) => a.amount).join(',') || 'none'}`;
}
