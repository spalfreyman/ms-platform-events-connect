import { api } from './ct.js';

/** True once the OMS has acknowledged the order: makes redelivered OrderCreated events harmless (idempotent). */
export const alreadyAcknowledged = (order: any) => order?.custom?.fields?.omsStatus === 'Accepted';

export const omsPayload = (o: any) => ({
  commerceOrderId: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt, customerEmail: o.customerEmail, total: o.totalPrice,
  lines: (o.lineItems ?? []).map((l: any) => ({ sku: l.variant?.sku, quantity: l.quantity, total: l.totalPrice })),
  shipping: o.shippingMode === 'Multiple' ? (o.shipping ?? []).map((s: any) => s.shippingInfo?.shippingMethodName) : [o.shippingInfo?.shippingMethodName],
});

/**
 * Hand the order to the OMS and record its acknowledgement on the commercetools order. Throws if the OMS does not accept it,
 * so the event is NOT acknowledged and Connect redelivers it (at-least-once, with backoff): an outage delays the hand-off but
 * never loses an order.
 */
export async function handOff(orderId: string, url: string, secret: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const o = (await api('GET', `/orders/${orderId}`)).json;
    if (!o?.id) throw new Error(`order ${orderId} not found`);
    if (alreadyAcknowledged(o)) return 'already acknowledged';
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: secret }, body: JSON.stringify(omsPayload(o)) });
    if (!r.ok) throw new Error(`OMS rejected order ${o.orderNumber}: ${r.status}`);
    const ack: any = await r.json();
    const fields = { omsStatus: 'Accepted', omsReference: String(ack.omsReference ?? ''), omsAckAt: new Date().toISOString() };
    const custom = o.custom?.type
      ? Object.entries(fields).map(([name, value]) => ({ action: 'setCustomField', name, value }))
      : [{ action: 'setCustomType', type: { typeId: 'type', key: 'ms-cart-order' }, fields }];
    const u = await api('POST', `/orders/${o.id}`, { version: o.version, actions: [...custom, ...(o.orderState === 'Open' ? [{ action: 'changeOrderState', orderState: 'Confirmed' }] : [])] });
    if (u.status === 409) continue; // concurrent update, re-read and retry
    if (u.status >= 300) throw new Error(`could not record OMS acknowledgement: ${u.status} ${JSON.stringify(u.json).slice(0, 200)}`);
    return `acknowledged ${fields.omsReference}`;
  }
  throw new Error('gave up after concurrent updates');
}
