const BASE = 'https://api.tcgdex.net/v2/en';

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  console.log('API', url.toString(), res.status);
  if (!res.ok) throw new Error(`TCGDex ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}
