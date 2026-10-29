import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, draft, MESSAGE_TYPES, CHANGE_TYPES, B2B_ONLY } from '../src/subscription.js';

test('decodes a Pub/Sub push envelope', () => {
  const payload = { notificationType: 'Message', type: 'OrderCreated', resource: { typeId: 'order', id: 'abc' } };
  const out = decode({ message: { data: Buffer.from(JSON.stringify(payload)).toString('base64'), messageId: '42', publishTime: '2026-10-27T10:00:00Z' } });
  assert.deepEqual(out?.payload, payload); assert.equal(out?.messageId, '42');
});
test('rejects bodies without data or with bad JSON', () => {
  assert.equal(decode({}), null); assert.equal(decode({ message: { data: Buffer.from('not json').toString('base64') } }), null);
});
test('subscription covers every message, change and event type', () => {
  const d = draft('proj', 'topic');
  assert.equal(d.messages.length, MESSAGE_TYPES.length); assert.equal(d.changes.length, CHANGE_TYPES.length); assert.deepEqual(d.events.map((e) => e.resourceTypeId), ['checkout', 'import-api']);
  assert.equal(d.destination.type, 'GoogleCloudPubSub');
});
test('never subscribes to custom object changes (feedback loop)', () => assert.equal(draft('p', 't').changes.some((c) => c.resourceTypeId === 'key-value-document'), false));
test('B2B-only types can be dropped', () => { const d = draft('p', 't', false); for (const t of B2B_ONLY) assert.equal(d.messages.some((m) => m.resourceTypeId === t) || d.changes.some((c) => c.resourceTypeId === t), false); });

import { applySpend, spendByBucket } from '../src/sparks.js';
import { alreadyAcknowledged, omsPayload } from '../src/oms.js';
test('Sparks: spend-to-earn completes and is idempotent per order', () => {
  const state: any = { activated: { 'fhb-10-40': { progress: 2500, done: false, expires: '2099-01-01' } } };
  const r1 = applySpend(state, { fhb: 2000, flowers: 0 }, 'o1');
  assert.equal(r1.pendingAdd, 1000); assert.equal(r1.state.activated['fhb-10-40'].done, true);
  const r2 = applySpend(r1.state, { fhb: 2000, flowers: 0 }, 'o1'); assert.equal(r2.duplicate, true); assert.equal(r2.pendingAdd, 0);
});
test('Sparks: alcohol and gifts do not count', () => {
  const o = { lineItems: [{ productId: 'a', totalPrice: { centAmount: 3000 }, variant: { attributes: [{ name: 'ageRestriction', value: { key: '18' } }] } }, { productId: 'b', lineItemMode: 'GiftLineItem', totalPrice: { centAmount: 0 } }, { productId: 'c', totalPrice: { centAmount: 1500 } }] };
  assert.deepEqual(spendByBucket(o, { c: 'Women' }), { fhb: 1500, flowers: 0 });
});
test('OMS: acknowledged orders are skipped on redelivery', () => {
  assert.equal(alreadyAcknowledged({ custom: { fields: { omsStatus: 'Accepted' } } }), true);
  assert.equal(alreadyAcknowledged({ custom: { fields: {} } }), false);
  assert.equal(omsPayload({ id: 'x', orderNumber: 'MS1', lineItems: [{ variant: { sku: 's' }, quantity: 2, totalPrice: { centAmount: 10 } }] }).lines[0].sku, 's');
});
