import { api } from './ct.js';
import { draft, SUBSCRIPTION_KEY } from './subscription.js';

// Connect provisions a Pub/Sub topic for event apps and exposes it in these variables; the Subscription points commercetools at it.
async function main() {
  const projectId = process.env.CONNECT_GCP_PROJECT_ID!; const topic = process.env.CONNECT_GCP_TOPIC_NAME!;
  if (!projectId || !topic) throw new Error('CONNECT_GCP_PROJECT_ID / CONNECT_GCP_TOPIC_NAME missing (event application required)');
  const cur = await api('GET', `/subscriptions/key=${SUBSCRIPTION_KEY}`);
  if (cur.status === 200) await api('DELETE', `/subscriptions/key=${SUBSCRIPTION_KEY}?version=${cur.json.version}`);
  let r = await api('POST', '/subscriptions', draft(projectId, topic, true));
  if (r.status === 400) { console.warn('retrying without B2B-only types', JSON.stringify(r.json).slice(0, 300)); r = await api('POST', '/subscriptions', draft(projectId, topic, false)); }
  if (r.status >= 300) throw new Error(`subscription create failed ${r.status} ${JSON.stringify(r.json).slice(0, 500)}`);
  console.log('subscription created', r.json.id);
}
if (process.argv[1]?.endsWith('post-deploy.js')) main().catch((e) => { console.error(e); process.exit(1); });
