// commercetools does not emit an event at the instant a discount's validity window opens or closes (it only emits changes when
// the discount is edited). This job closes that gap: each run looks at the window since the last run and reports transitions.
export type Transition = { type: 'PromotionStarted' | 'PromotionEnded'; resourceTypeId: string; id: string; key?: string; name: string; at: string };

export function transitions(resourceTypeId: string, items: any[], from: Date, to: Date): Transition[] {
  const out: Transition[] = [];
  const within = (iso?: string) => !!iso && Date.parse(iso) > from.getTime() && Date.parse(iso) <= to.getTime();
  for (const d of items) {
    const name = d.name?.['en-GB'] ?? d.code ?? d.key ?? d.id;
    if (d.isActive === false) continue;
    if (within(d.validFrom)) out.push({ type: 'PromotionStarted', resourceTypeId, id: d.id, key: d.key ?? d.code, name, at: d.validFrom });
    if (within(d.validUntil)) out.push({ type: 'PromotionEnded', resourceTypeId, id: d.id, key: d.key ?? d.code, name, at: d.validUntil });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Shape the transition like a platform notification so the same pipeline (dashboard, Kafka, ...) can consume it. */
export const toNotification = (t: Transition, projectKey: string) => ({
  notificationType: 'Event', type: t.type, projectKey, id: `${t.type}-${t.id}-${t.at}`, createdAt: t.at,
  resource: { typeId: t.resourceTypeId, id: t.id }, resourceUserProvidedIdentifiers: t.key ? { key: t.key } : {}, name: t.name, source: 'promo-lifecycle job',
});
