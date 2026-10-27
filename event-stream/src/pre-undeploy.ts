import { api } from './ct.js';
import { SUBSCRIPTION_KEY } from './subscription.js';
(async () => { const cur = await api('GET', `/subscriptions/key=${SUBSCRIPTION_KEY}`); if (cur.status === 200) await api('DELETE', `/subscriptions/key=${SUBSCRIPTION_KEY}?version=${cur.json.version}`); })().catch((e) => { console.error(e); process.exit(1); });
