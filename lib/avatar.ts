// Deterministic gradient avatar palette. A user's id always maps to the same
// two-tone gradient so their avatar looks stable across sessions and screens.

const AVATAR_PALETTE: [string, string][] = [
  ['#FFD700', '#FF7A3A'],
  ['#7A6BFF', '#5FD2FF'],
  ['#9CFF6E', '#2EA15A'],
  ['#FF7AE0', '#7B2AC9'],
  ['#5FD2FF', '#FFB8E0'],
];

export function avatarFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
