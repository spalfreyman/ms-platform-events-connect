const E = (k: string) => process.env[k] ?? '';
let tok = { t: '', exp: 0 };
async function token() {
  if (Date.now() < tok.exp - 60_000) return tok.t;
  const d: any = await fetch(`${E('CTP_AUTH_URL')}/oauth/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${E('CTP_CLIENT_ID')}:${E('CTP_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: E('CTP_SCOPES') }) }).then((r) => r.json());
  tok = { t: d.access_token, exp: Date.now() + d.expires_in * 1000 }; return tok.t;
}
export async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${E('CTP_API_URL')}/${E('CTP_PROJECT_KEY')}${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
}
