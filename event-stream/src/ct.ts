const E = (k: string) => process.env[k] ?? '';
export async function api(method: string, path: string, body?: unknown) {
  const t: any = await fetch(`${E('CTP_AUTH_URL')}/oauth/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${E('CTP_CLIENT_ID')}:${E('CTP_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: E('CTP_SCOPES') }) }).then((r) => r.json());
  const r = await fetch(`${E('CTP_API_URL')}/${E('CTP_PROJECT_KEY')}${path}`, { method, headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
}
