// Shared grading + condition vocabulary. Used by the grading queue, the
// add-to-collection sheet, and anywhere a copy's grade/condition is selected.

export const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG', 'ACE'] as const;
export type Grader = (typeof GRADERS)[number];

// PSA-first display order, matching the pricing module's grouping.
export const GRADER_ORDER: Record<string, number> = {
  PSA: 0, CGC: 1, BGS: 2, TAG: 3, ACE: 4,
};

// Selectable grades, highest first. Half-grades cover BGS/CGC subgrades.
export const GRADES = [
  '10', '9.5', '9', '8.5', '8', '7', '6', '5', '4', '3', '2', '1',
] as const;
export type Grade = (typeof GRADES)[number];

// Raw-card condition ladder (Near Mint → Damaged).
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DM'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DM: 'Damaged',
};

/**
 * Short human label for a held copy, e.g. "PSA 10 · Holofoil",
 * "LP · Reverse Holo", or "Holofoil". Returns null for a legacy/plain copy
 * with no distinguishing attributes. `variant_name` is expected to already be
 * a display name.
 */
export function copyLabel(c: {
  variant_name?: string | null;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
}): string | null {
  const parts: string[] = [];
  if (c.grader && c.grade) parts.push(`${c.grader} ${c.grade}`);
  else if (c.condition) parts.push(c.condition);
  if (c.variant_name) parts.push(c.variant_name);
  return parts.length ? parts.join(' · ') : null;
}
