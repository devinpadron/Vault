import { supabase } from '@/lib/supabase';

// Population (census) data for a card, sourced from Scrydex include=pop_reports
// and stored in card_pop_reports (Tier 3, append-only daily snapshots). We read
// only the most recent snapshot per (variant, grading company).

export interface PopGrade {
  grade: string;   // '10' | '9' | 'Authentic' | …
  count: number;
}

export interface PopReport {
  variantName: string | null;   // Scrydex variant name — match against card variants
  grader: string;               // 'PSA'
  totalGraded: number | null;   // grand total graded at this company
  grades: PopGrade[];           // numeric grades first (desc), then the rest
  snapshotDate: string;         // YYYY-MM-DD of the snapshot shown
}

type Row = {
  variant_name: string | null;
  grader: string;
  grade: string;
  population: number;
  total_graded: number | null;
  snapshot_date: string;
};

// Sort: numeric grades high→low, non-numeric (Authentic, etc.) last alphabetically.
function sortGrades(a: PopGrade, b: PopGrade): number {
  const na = parseFloat(a.grade);
  const nb = parseFloat(b.grade);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return nb - na;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.grade.localeCompare(b.grade);
}

export async function getCardPopReports(cardId: string): Promise<PopReport[]> {
  const { data } = await supabase
    .from('card_pop_reports')
    .select('variant_name, grader, grade, population, total_graded, snapshot_date')
    .eq('card_id', cardId)
    .order('snapshot_date', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Only the latest snapshot is shown; older rows are history for future trends.
  const latestDate = rows[0].snapshot_date;
  const latest = rows.filter(r => r.snapshot_date === latestDate);

  const byKey = new Map<string, PopReport>();
  for (const r of latest) {
    const key = `${r.grader}|${r.variant_name ?? ''}`;
    let report = byKey.get(key);
    if (!report) {
      report = {
        variantName: r.variant_name,
        grader: r.grader,
        totalGraded: r.total_graded,
        grades: [],
        snapshotDate: r.snapshot_date,
      };
      byKey.set(key, report);
    }
    report.grades.push({ grade: r.grade, count: r.population });
  }

  const reports = Array.from(byKey.values());
  for (const r of reports) r.grades.sort(sortGrades);
  return reports;
}
