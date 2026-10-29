import test from 'node:test';
import assert from 'node:assert/strict';
import { transitions, toNotification } from '../src/lifecycle.js';
const from = new Date('2026-11-27T00:00:00Z'), to = new Date('2026-11-27T00:05:00Z');
test('detects starts and ends inside the window only', () => {
  const t = transitions('cart-discount', [
    { id: 'a', key: 'bf', name: { 'en-GB': 'Black Friday' }, validFrom: '2026-11-27T00:00:00.000Z' }, // exactly at window start: belongs to previous run
    { id: 'b', key: 'x', name: { 'en-GB': 'X' }, validFrom: '2026-11-27T00:03:00.000Z' },
    { id: 'c', key: 'y', name: { 'en-GB': 'Y' }, validUntil: '2026-11-27T00:05:00.000Z' },
    { id: 'd', key: 'z', name: { 'en-GB': 'Z' }, validFrom: '2026-11-27T00:04:00.000Z', isActive: false },
  ], from, to);
  assert.deepEqual(t.map((x) => [x.type, x.id]), [['PromotionStarted', 'b'], ['PromotionEnded', 'c']]);
});
test('notification shape matches the platform pipeline', () => {
  const n = toNotification({ type: 'PromotionStarted', resourceTypeId: 'cart-discount', id: 'b', key: 'x', name: 'X', at: '2026-11-27T00:03:00.000Z' }, 'p');
  assert.equal(n.notificationType, 'Event'); assert.equal(n.resource.typeId, 'cart-discount'); assert.equal(n.createdAt, '2026-11-27T00:03:00.000Z');
});
