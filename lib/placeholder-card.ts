// Placeholder Card object used when we need to render a Card-shaped row but
// don't have real data (e.g. an empty binder cover, a friend's collection
// surfaced before cards are hydrated). Kept as a single export so every
// surface shows the same neutral fallback.

import { Card } from '@/types';

export const PLACEHOLDER_CARD: Card = {
  id: 'placeholder',
  name: 'Empty',
  variant: '—',
  set: 'POKEVAULT',
  no: '—',
  release: '—',
  rarity: 'Common',
  value: 0,
  change: 0,
  trend30d: null,
  foil: false,
  art: ['#1F0E3A', '#2D1B5E', '#1F0E3A'],
  creature: '○',
  types: ['dark'],
  artist: '—',
};
