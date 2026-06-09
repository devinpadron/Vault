// Identify Edge Function
//
// Proxy in front of Scrydex Vision (`POST /vision/v1/cards/identify`). Accepts
// a multipart upload from the React Native client (an `image` file field and
// an optional `games` field), re-streams the file to Scrydex along with the
// shared X-Api-Key / X-Team-ID secrets, and returns Scrydex's JSON response
// to the client.
//
// Scrydex Vision costs 5 credits per request — meaningfully more than the
// 1-credit metadata calls. Each invocation logs to sync_log with the captured
// `credits_used` header so the cost shows up in the same dashboards.
//
// Environment variables (set via `supabase secrets set`):
//   SCRYDEX_API_KEY          — Scrydex X-Api-Key
//   SCRYDEX_TEAM_ID          — Scrydex X-Team-ID
//   SUPABASE_URL             — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient } from 'npm:@supabase/supabase-js@2';

const SCRYDEX_URL = 'https://api.scrydex.com/vision/v1/cards/identify';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const apiKey = Deno.env.get('SCRYDEX_API_KEY') ?? '';
  const teamId = Deno.env.get('SCRYDEX_TEAM_ID') ?? '';
  const sbUrl  = Deno.env.get('SUPABASE_URL')    ?? '';
  const sbKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!apiKey || !teamId) {
    return json({ error: 'SCRYDEX_API_KEY and SCRYDEX_TEAM_ID must be set' }, 500);
  }

  const supabase = createClient(sbUrl, sbKey);

  // ── Parse multipart from the client ──────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data body' }, 400);
  }

  const image = form.get('image');
  if (!(image instanceof File) && !(image instanceof Blob)) {
    return json({ error: 'Missing `image` file field' }, 400);
  }
  const games = (form.get('games') as string | null) ?? 'pokemon';

  // ── Start sync_log row ───────────────────────────────────────────────────
  const { data: logRow } = await supabase
    .from('sync_log')
    .insert({
      endpoint:    '/identify',
      query_params: { games },
      status:      'partial',
      started_at:  new Date().toISOString(),
    })
    .select('id')
    .single();
  const logId: number | null = (logRow as { id: number } | null)?.id ?? null;

  const finishLog = async (
    status: 'success' | 'error',
    httpStatus: number | null,
    creditsUsed: number | null,
    rows?: number,
    err?: string,
  ) => {
    if (!logId) return;
    await supabase.from('sync_log').update({
      status,
      rows_affected: rows ?? null,
      error_message: err ?? null,
      http_status:   httpStatus,
      credits_used:  creditsUsed,
      finished_at:   new Date().toISOString(),
    }).eq('id', logId);
  };

  // ── Forward to Scrydex Vision ────────────────────────────────────────────
  const sxForm = new FormData();
  sxForm.append('image', image, (image as File).name ?? 'card.jpg');
  sxForm.append('games', games);

  let res: Response;
  try {
    // Don't set Content-Type — fetch fills in the multipart boundary.
    res = await fetch(SCRYDEX_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Team-ID': teamId,
        'Accept':    'application/json',
      },
      body: sxForm,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLog('error', null, null, undefined, msg);
    return json({ status: 'error', error: msg }, 502);
  }

  const credits = parseHeaderInt(res.headers.get('X-Credits-Used'))
                ?? parseHeaderInt(res.headers.get('X-RateLimit-Used'));

  if (!res.ok) {
    const errBody = await res.text();
    await finishLog('error', res.status, credits, undefined, errBody.slice(0, 500));
    return json({ status: 'error', error: `Scrydex ${res.status}: ${errBody}` }, 502);
  }

  // Scrydex wraps everything under `data`. Flatten for the client.
  // deno-lint-ignore no-explicit-any
  const payload: any = await res.json();
  const matchCount = Array.isArray(payload?.data?.matches) ? payload.data.matches.length : 0;
  await finishLog('success', res.status, credits, matchCount);

  return json({
    status:    'ok',
    analysis:  payload?.data?.analysis ?? null,
    matches:   payload?.data?.matches ?? [],
    total_count: payload?.data?.total_count ?? matchCount,
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function parseHeaderInt(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
