// Client wrapper around the `identify` Edge Function. Takes a local file URI
// (typically from expo-camera's `takePictureAsync`) and returns the Scrydex
// Vision matches.
//
// The Edge Function holds the SCRYDEX_API_KEY — the RN app only forwards an
// authenticated request with the captured photo. Image bytes are streamed via
// multipart/form-data so we never base64-inflate a 500 KB JPEG into a 700 KB
// JSON string.

import { supabase } from '@/lib/supabase';

// Subset of Scrydex's brief card shape — enough to render the match cell and
// route to /card/[id]. The full shape is also passed through so detail views
// can use it directly if our local cards table is missing the row.
export interface VisionMatchCard {
  id: string;                       // e.g. "me2pt5-284"
  name: string;
  supertype?: string;
  rarity?: string;
  number?: string;
  printed_number?: string;
  images?: { type: string; small: string; medium: string; large: string }[];
  expansion?: { id: string; name: string; series?: string };
  language_code?: string;
}

export interface VisionMatch {
  score: number;                    // Scrydex confidence — typically 0.7 – 1.3+
  variant?: string;                 // e.g. "holofoil"
  card: VisionMatchCard;
}

export interface VisionAnalysis {
  type: 'raw' | 'graded';
  game: string;                     // "pokemon" | "lorcana" | …
  language_code: string;
  graded_details?: {
    company:      string;           // "PSA" | "BGS" | …
    grade_code:   string;           // "GEM-MT"
    grade_label:  string;           // "Gem Mint"
    grade_number: string;           // "10"
    year?:        string;
    cert?:        string;
  };
}

export interface VisionResponse {
  status: 'ok' | 'error';
  analysis: VisionAnalysis | null;
  matches: VisionMatch[];
  total_count: number;
  error?: string;
}

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Send a captured photo to Scrydex Vision via the `identify` Edge Function.
 * `localUri` is the file URI returned by `expo-camera`.
 */
export async function identifyCardFromImage(
  localUri: string,
  games: string[] = ['pokemon'],
): Promise<VisionResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  // RN's FormData accepts the `{ uri, name, type }` shape for files —
  // the native networking layer reads the URI directly, no base64 hop.
  const form = new FormData();
  form.append(
    'image',
    // RN's FormData type doesn't match DOM Blob; cast lets us pass the
    // documented mobile shape without TS complaints.
    { uri: localUri, name: 'card.jpg', type: 'image/jpeg' } as unknown as Blob,
  );
  form.append('games', games.join(','));

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON,
    Accept: 'application/json',
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  // Don't set Content-Type; the fetch implementation fills in the boundary.

  const res = await fetch(`${SUPABASE_URL}/functions/v1/identify`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`identify ${res.status}: ${body || res.statusText}`);
  }

  return res.json() as Promise<VisionResponse>;
}

// Maps Scrydex's typically-0.7-to-1.3 score range into a label for the UI.
// Score >= 1.0 — multiple matching signals on the card; treat as confident.
// 0.85 – 1.0  — visual similarity but partial data verification.
// < 0.85       — low confidence; nudge the user toward manual search.
export type VisionConfidence = 'strong' | 'likely' | 'low';

export function confidenceLabel(score: number): VisionConfidence {
  if (score >= 1.0)  return 'strong';
  if (score >= 0.85) return 'likely';
  return 'low';
}
