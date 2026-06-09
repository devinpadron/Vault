// Phase: cron-news-refresh — pull articles from 5 Pokemon news sources,
// dedupe by (source, external_id), upsert into news_items. Runs hourly via
// pg_cron. Each source is fetched independently — one broken feed never
// stops the others.
//
// Most outlets (Pokebeach, Pokemon.com, TCGplayer Infinite, Reddit) sit
// behind Cloudflare / bot-protection that blocks server-side fetches. We
// route those through Google News RSS, which is server-friendly and
// returns deduped, deep-linkable items. Bulbanews exposes its own
// MediaWiki RSS so we hit that directly.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface NewsRefreshResult {
  totalInserted: number;
  perSource: Record<string, { fetched: number; inserted: number; error: string | null }>;
}

interface FeedSource {
  id: 'pokebeach' | 'pokemon_official' | 'bulbanews' | 'reddit_tcg' | 'tcgplayer_infinite';
  tag: 'OFFICIAL' | 'TCG' | 'COMMUNITY' | 'MARKET';
  url: string;
  // Some outlets need their site-name suffix stripped from Google News titles
  // ("Foo Bar - PokeBeach" → "Foo Bar").
  stripSuffix?: string;
}

const GOOGLE_NEWS = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const SOURCES: FeedSource[] = [
  { id: 'pokebeach',          tag: 'TCG',
    url: GOOGLE_NEWS('pokemon tcg site:pokebeach.com'),
    stripSuffix: 'PokeBeach' },
  { id: 'pokemon_official',   tag: 'OFFICIAL',
    url: GOOGLE_NEWS('pokemon trading card game site:pokemon.com'),
    stripSuffix: 'Pokemon.com' },
  { id: 'bulbanews',          tag: 'COMMUNITY',
    url: 'https://bulbanews.bulbagarden.net/w/api.php?hidebots=1&urlversion=1&days=7&limit=50&action=feedrecentchanges&feedformat=rss' },
  { id: 'reddit_tcg',         tag: 'COMMUNITY',
    url: GOOGLE_NEWS('site:reddit.com/r/PokemonTCG'),
    stripSuffix: 'reddit.com' },
  { id: 'tcgplayer_infinite', tag: 'MARKET',
    url: GOOGLE_NEWS('pokemon tcg market site:tcgplayer.com OR site:infinite.tcgplayer.com'),
    stripSuffix: 'TCGplayer' },
];

// Cap on og:image fallback HTTP fetches per refresh, total across sources.
const OG_IMAGE_BUDGET = 30;

// Per-source soft cap on items kept per refresh.
const PER_SOURCE_ITEM_CAP = 20;

// Skip items more than this many days old at ingest time. Google News `site:`
// queries occasionally surface very old articles (2015, 2018, etc.) that
// pollute the feed.
const MAX_ITEM_AGE_DAYS = 30;

// MediaWiki namespace prefixes — Bulbanews's RecentChanges feed includes
// every wiki edit, not just article publications. Strip the namespace noise.
const WIKI_NAMESPACE_PREFIXES = [
  'User:', 'Talk:', 'User talk:', 'File:', 'File talk:', 'Special:',
  'Category:', 'Category talk:', 'Template:', 'Template talk:',
  'Help:', 'Help talk:', 'Project:', 'Project talk:',
];

interface NewsRow {
  source:        FeedSource['id'];
  external_id:   string;
  title:         string;
  summary:       string | null;
  url:           string;
  image_url:     string | null;
  tag:           FeedSource['tag'];
  published_at:  string;        // ISO
  raw_payload:   unknown;
}

export async function refreshNews(supabase: SupabaseClient): Promise<NewsRefreshResult> {
  const perSource: NewsRefreshResult['perSource'] = {};

  const results = await Promise.all(
    SOURCES.map(async source => {
      try {
        const items = await fetchRss(source);
        perSource[source.id] = { fetched: items.length, inserted: 0, error: null };
        return items;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        perSource[source.id] = { fetched: 0, inserted: 0, error: msg };
        return [];
      }
    }),
  );

  // og:image fallback pass — bounded so we don't burn the wall budget.
  // Skip Google News redirector URLs: they serve a JS interstitial whose
  // og:image is just the Google News logo, which would visually flatten the
  // whole feed. Bulbanews + any future direct sources can still benefit.
  let ogBudget = OG_IMAGE_BUDGET;
  const flat: NewsRow[] = [];
  for (const list of results) {
    for (const item of list) {
      const isGoogleNews = item.url.startsWith('https://news.google.com/');
      if (!item.image_url && !isGoogleNews && ogBudget > 0) {
        try {
          const og = await extractOgImage(item.url);
          if (og) item.image_url = og;
        } catch {
          // Silent — gradient fallback handles it client-side.
        }
        ogBudget--;
      }
      flat.push(item);
    }
  }

  if (flat.length === 0) return { totalInserted: 0, perSource };

  const { error, count } = await supabase
    .from('news_items')
    .upsert(flat, { onConflict: 'source,external_id', count: 'estimated' });

  if (error) {
    for (const id of Object.keys(perSource)) perSource[id].error ??= error.message;
    throw new Error(`news upsert: ${error.message}`);
  }

  // Best-effort: spread the count across sources proportionally.
  const totalInserted = count ?? flat.length;
  for (const id of Object.keys(perSource)) {
    const f = perSource[id].fetched;
    perSource[id].inserted = flat.length === 0
      ? 0
      : Math.round(totalInserted * (f / flat.length));
  }

  return { totalInserted, perSource };
}

// ─── RSS ─────────────────────────────────────────────────────────────────────

async function fetchRss(source: FeedSource): Promise<NewsRow[]> {
  const res = await fetch(source.url, {
    headers: {
      // Google News and most other feed endpoints accept a generic browser-y UA.
      'User-Agent': 'Mozilla/5.0 (compatible; PokeVaultNewsBot/1.0; +https://pokevault.app)',
      'Accept':     'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`RSS ${source.id} HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml).slice(0, PER_SOURCE_ITEM_CAP);

  return items
    .map(it => mapRssItem(source, it))
    .filter((r): r is NewsRow => r !== null);
}

interface RawRssItem {
  title?:        string;
  link?:         string;
  guid?:         string;
  pubDate?:      string;
  description?:  string;
  enclosureUrl?: string;
  mediaUrl?:     string;
}

// Minimal RSS 2.0 / Atom parser — finds <item> or <entry> blocks and pulls
// the few fields we care about with regex. Resilient to leading XML decls,
// CDATA wrapping, and self-closing tags.
function parseRssItems(xml: string): RawRssItem[] {
  // Detect Atom by presence of <feed xmlns="http://www.w3.org/2005/Atom">.
  // An RSS feed has <rss> at top.
  const isAtom = /<feed[\s>][^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml);
  const blockRe = isAtom
    ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
    : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const items: RawRssItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    if (isAtom) {
      items.push({
        title:       firstTag(block, 'title'),
        link:        firstAtomLink(block) ?? firstTag(block, 'link'),
        guid:        firstTag(block, 'id'),
        pubDate:     firstTag(block, 'updated') ?? firstTag(block, 'published'),
        description: firstTag(block, 'summary') ?? firstTag(block, 'content'),
        mediaUrl:    firstMediaUrl(block),
      });
    } else {
      items.push({
        title:        firstTag(block, 'title'),
        link:         firstTag(block, 'link'),
        guid:         firstTag(block, 'guid'),
        pubDate:      firstTag(block, 'pubDate'),
        description:  firstTag(block, 'description') ?? firstTag(block, 'content:encoded'),
        enclosureUrl: firstAttr(block, 'enclosure', 'url'),
        mediaUrl:     firstMediaUrl(block),
      });
    }
  }
  return items;
}

function firstTag(block: string, tag: string): string | undefined {
  const escaped = tag.replace(/:/g, '\\:');
  const re = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const m = block.match(re);
  if (!m) return undefined;
  return decodeCdata(m[1]).trim() || undefined;
}

function firstAttr(block: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m?.[1];
}

function firstAtomLink(block: string): string | undefined {
  // Prefer rel="alternate"; fall back to first <link href="...">.
  const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const any = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return any?.[1];
}

function firstMediaUrl(block: string): string | undefined {
  // <media:thumbnail url=".."/>, <media:content url=".."/>, or first <img src="..."> in description.
  const media = block.match(/<media:(?:thumbnail|content)\b[^>]*url=["']([^"']+)["']/i);
  if (media) return media[1];
  const img = block.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return img?.[1];
}

function decodeCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function stripHtml(s: string | undefined | null, max = 240): string | null {
  if (!s) return null;
  const text = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function mapRssItem(source: FeedSource, it: RawRssItem): NewsRow | null {
  const url = it.link?.trim();
  if (!url) return null;
  let title = stripHtml(it.title, 200);
  if (!title) return null;

  // Google News appends " - Source Name" to every title — strip it for the
  // outlet so the UI doesn't read "Foo Bar - PokeBeach" everywhere.
  if (source.stripSuffix) {
    const re = new RegExp(`\\s*[\\-–—]\\s*${escapeRegex(source.stripSuffix)}\\s*$`, 'i');
    title = title.replace(re, '').trim() || title;
  }

  const published = parseDate(it.pubDate);
  if (!published) return null;

  // Drop stale items at ingest — Google News `site:` queries surface old
  // articles that pollute the feed.
  const ageDays = (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > MAX_ITEM_AGE_DAYS) return null;

  // Drop MediaWiki namespace items from Bulbanews's RecentChanges feed.
  if (source.id === 'bulbanews' && WIKI_NAMESPACE_PREFIXES.some(p => title.startsWith(p))) {
    return null;
  }

  return {
    source:       source.id,
    external_id:  it.guid?.trim() || url,
    title,
    summary:      stripHtml(it.description, 280),
    url,
    image_url:    it.enclosureUrl ?? it.mediaUrl ?? null,
    tag:          source.tag,
    published_at: published.toISOString(),
    raw_payload:  it,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

// ─── og:image fallback ───────────────────────────────────────────────────────

async function extractOgImage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PokeVaultNewsBot/1.0)' },
    // Only need the <head>. Most sites return it in the first few KB; this
    // saves bandwidth and protects us from megabyte-sized pages.
    signal: AbortSignal.timeout(5_000),
    redirect: 'follow',
  });
  if (!res.ok) return null;

  const reader = res.body?.getReader();
  if (!reader) return null;
  let html = '';
  const decoder = new TextDecoder();
  let received = 0;
  while (received < 60_000) {
    const { value, done } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    received += value.length;
    if (html.includes('</head>')) break;
  }
  reader.cancel().catch(() => {});

  const m = html.match(/<meta\s+property=["']og:image(?::secure_url)?["']\s+content=["']([^"']+)["']/i)
        ?? html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image(?::secure_url)?["']/i);
  return m?.[1] ?? null;
}
