// One Subscription for everything: every message resource type, every change resource type and every event type.
export const SUBSCRIPTION_KEY = 'ms-platform-events';

export const MESSAGE_TYPES = ['approval-flow', 'approval-rule', 'associate-role', 'business-unit', 'category', 'customer', 'customer-email-token', 'customer-group', 'customer-password-token',
  'inventory-entry', 'order', 'payment', 'product', 'product-selection', 'product-tailoring', 'quote', 'quote-request', 'review', 'shopping-list', 'staged-quote', 'standalone-price', 'store', 'variant'];

// key-value-document (custom objects) is left out on purpose: the dashboard stores its events as custom objects, which would create a feedback loop.
export const CHANGE_TYPES = ['approval-flow', 'approval-rule', 'associate-role', 'attribute-group', 'business-unit', 'cart', 'cart-discount', 'category', 'channel', 'customer', 'customer-email-token',
  'customer-group', 'customer-password-token', 'discount-code', 'discount-group', 'extension', 'inventory-entry', 'order', 'order-edit', 'payment', 'product', 'product-discount', 'product-selection',
  'product-tailoring', 'product-type', 'quote', 'quote-request', 'recurrence-policy', 'recurring-order', 'review', 'shipping-method', 'shopping-list', 'staged-quote', 'standalone-price', 'state', 'store',
  'subscription', 'tax-category', 'type', 'variant', 'zone'];

export const EVENT_TYPES = ['checkout', 'import-api'];
// Only available on B2B-enabled projects; dropped automatically if the API rejects them.
export const B2B_ONLY = ['approval-flow', 'approval-rule', 'associate-role', 'business-unit'];

export const draft = (projectId: string, topic: string, withB2b = true) => {
  const keep = (t: string) => withB2b || !B2B_ONLY.includes(t);
  return {
    key: SUBSCRIPTION_KEY,
    destination: { type: 'GoogleCloudPubSub', projectId, topic },
    messages: MESSAGE_TYPES.filter(keep).map((resourceTypeId) => ({ resourceTypeId })),
    changes: CHANGE_TYPES.filter(keep).map((resourceTypeId) => ({ resourceTypeId })),
    events: EVENT_TYPES.map((resourceTypeId) => ({ resourceTypeId })),
    format: { type: 'Platform' },
  };
};

/** Pub/Sub push envelope -> the commercetools notification it carries. */
export function decode(body: any): { payload: unknown; messageId?: string; publishTime?: string } | null {
  const data = body?.message?.data; if (typeof data !== 'string') return null;
  try { return { payload: JSON.parse(Buffer.from(data, 'base64').toString('utf8')), messageId: body.message.messageId, publishTime: body.message.publishTime }; } catch { return null; }
}
