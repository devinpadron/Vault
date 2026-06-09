// Gradient tone pairs offered for binder covers. The user picks one when
// creating a binder; it's persisted as (tone_start, tone_end) and used by
// every binder render surface.

export const TONE_PAIRS: [string, string][] = [
  ['#1F0E3A', '#7A6BFF'],
  ['#3A0E0E', '#FF7A3A'],
  ['#0E1F3A', '#5FD2FF'],
  ['#0E2F1F', '#9CFF6E'],
  ['#3A2A0E', '#FFE03A'],
  ['#1F0E2A', '#FF7AE0'],
];

// Deterministic tone-for-id helper used when we want a stable colour for a
// collection that has no explicit tone saved (e.g. a friend's public binder
// surfaced via the read-only collection schema).
export function toneFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TONE_PAIRS[Math.abs(hash) % TONE_PAIRS.length];
}
