import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { NewsItem } from '@/types';

// Per-source gradient palette — used as a visual identity AND as a fallback
// when the row has no image. Keeps a recognizable look-and-feel per outlet.
const SOURCE_GRADIENT: Record<string, [string, string, string]> = {
  pokebeach:          ['#FFE03A', '#D9A300', '#3A2A0E'], // gold (TCG)
  pokemon_official:   ['#7A6BFF', '#3A1E9C', '#0E0A2E'], // royal (official)
  bulbanews:          ['#9CFF6E', '#2EA15A', '#0E2F1F'], // grass (community)
  reddit_tcg:         ['#FF7A3A', '#C0291A', '#3A0E0E'], // ember (community/heat)
  tcgplayer_infinite: ['#5FD2FF', '#2A6BC9', '#0E1F3A'], // tide (market)
};

const DEFAULT_GRADIENT: [string, string, string] = ['#5C5C75', '#1F1F2D', '#08080F'];

interface Row {
  id:           string;
  source:       string;
  title:        string;
  summary:      string | null;
  url:          string;
  image_url:    string | null;
  tag:          string;
  published_at: string;
}

export function useNews() {
  return useQuery<NewsItem[]>({
    queryKey: ['news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_items')
        .select('id, source, title, summary, url, image_url, tag, published_at')
        .order('published_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(rowToNewsItem);
    },
    staleTime: 1000 * 60 * 10,
  });
}

function rowToNewsItem(row: Row): NewsItem {
  return {
    id:        row.id,
    tag:      row.tag.toUpperCase(),
    when:     formatWhen(row.published_at),
    title:    row.title,
    art:      SOURCE_GRADIENT[row.source] ?? DEFAULT_GRADIENT,
    minutes:  estimateReadTime(row.summary, row.title),
    url:      row.url,
    image_url: row.image_url,
    source:   row.source,
  };
}

// Relative-time formatter matching the look of the old mocks ("01h ago",
// "WEEKEND", "06.12 · TUE"). Falls back to a date string for older items.
function formatWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1)    return 'NOW';
  if (min < 60)   return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)   return `${String(hrs).padStart(2, '0')}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const wk = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return `${mm}.${dd} · ${wk}`;
}

// Rough Medium-style read-time guess from summary+title length. Capped at
// 1–9 minutes — anything more loses meaning in a feed row.
function estimateReadTime(summary: string | null, title: string): number {
  const wordCount = ((summary ?? '') + ' ' + title).trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(wordCount / 220));
  return Math.min(minutes, 9);
}
