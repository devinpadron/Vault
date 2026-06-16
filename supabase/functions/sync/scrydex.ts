const BASE = 'https://api.scrydex.com/pokemon/v1';

// ─── Scrydex response types ───────────────────────────────────────────────────

export interface ScrydexListResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  count: number;
  total_count: number;
}

export interface ScrydexExpansion {
  id: string;
  name: string;
  series: string;
  code: string;
  total: number;
  printed_total?: number;
  language: string;
  language_code: string;
  release_date?: string;
  is_online_only: boolean;
  logo?: string;
  symbol?: string;
}

export interface ScrydexImage {
  type: string;   // "front" | "back"
  small: string;
  medium: string;
  large: string;
}

export interface ScrydexPrice {
  variant: string;
  condition: string;
  type: string;
  low: number;
  market: number;
  currency: string;
  is_perfect: boolean;
  is_signed: boolean;
  is_error: boolean;
  // Trend data — present on GET /cards?include=prices but not documented in brief interface.
  // Extracted from raw_payload if available.
  trends?: {
    days_1?:  { price_change?: number; percent_change?: number };
    days_7?:  { price_change?: number; percent_change?: number };
    days_30?: { price_change?: number; percent_change?: number };
    days_90?: { price_change?: number; percent_change?: number };
  };
}

// Population (census) report — present on cards with include=pop_reports.
// One entry per grading company; Pokémon/PSA/English is the only coverage today.
export interface ScrydexPopReportGrade {
  grade: string;   // "10" | "9" | "Authentic" | …
  count: number;
}

export interface ScrydexPopReport {
  company: string;       // "PSA"
  total?: number;        // grand total graded at this company (incl. qualifiers/authentic)
  grade_total?: number;  // sum across numeric grades
  grades: ScrydexPopReportGrade[];
}

export interface ScrydexVariant {
  name: string;
  prices: ScrydexPrice[];
  pop_reports?: ScrydexPopReport[];
}

export interface ScrydexCardBrief {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  number: string;
  printed_number?: string;
  rarity?: string;
  rarity_code?: string;
  artist?: string;
  images: ScrydexImage[];
  expansion: ScrydexExpansion;
  language?: string;
  language_code: string;
  expansion_sort_order: number;
  variants?: ScrydexVariant[];
}

export interface ScrydexCardFull extends ScrydexCardBrief {
  // Vintage / metagame fields
  level?: string;
  evolves_from?: string[];
  rules?: string[];
  ancient_trait?: { name: string; text: string };
  // Game mechanics
  abilities?: Array<{ type: string; name: string; text: string }>;
  attacks?: Array<{ cost: string[]; converted_energy_cost: number; name: string; text: string; damage: string }>;
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreat_cost?: string[];
  converted_retreat_cost?: string | number;
  flavor_text?: string;
  regulation_mark?: string;
  national_pokedex_numbers?: number[];
  // Translation blob — populated for non-English cards
  translation?: Record<string, unknown>;
}

export interface ScrydexPriceHistoryEntry {
  date: string;
  prices: ScrydexPrice[];
}

export interface ScrydexPriceHistoryResponse {
  data: ScrydexPriceHistoryEntry[];
  page: number;
  page_size: number;
  count: number;
  total_count: number;
}

export interface ScrydexListing {
  id: string;
  source: string;
  card_id: string;
  title: string;
  variant: string;
  company?: string;
  grade?: string;
  is_perfect: boolean;
  is_error: boolean;
  is_signed: boolean;
  url: string;
  price: number;
  currency: string;
  sold_at: string;        // "YYYY/MM/DD"
}

export interface ScrydexListingsResponse {
  data: ScrydexListing[];
  page: number;
  page_size: number;
  count: number;
  total_count: number;
}

// ─── Observability ────────────────────────────────────────────────────────────

// Captured from the last response so callers can write http_status / credits
// to sync_log. Reset at the start of each phase by the caller.
export interface ScrydexResponseMeta {
  http_status: number | null;
  credits_used: number | null;
  rate_limit_remaining: number | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ScrydexClient {
  // Most recent response metadata — overwritten on every request.
  public lastMeta: ScrydexResponseMeta = {
    http_status: null,
    credits_used: null,
    rate_limit_remaining: null,
  };

  constructor(
    private readonly apiKey: string,
    private readonly teamId: string,
  ) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': this.apiKey,
        'X-Team-ID': this.teamId,
        'Accept': 'application/json',
      },
    });

    // Capture rate-limit + credit headers — Scrydex returns these on every response.
    this.lastMeta = {
      http_status: res.status,
      credits_used: parseHeaderInt(res.headers.get('X-Credits-Used')) ??
                    parseHeaderInt(res.headers.get('X-RateLimit-Used')),
      rate_limit_remaining: parseHeaderInt(res.headers.get('X-RateLimit-Remaining')),
    };

    if (!res.ok) {
      throw new Error(`Scrydex ${res.status} ${res.statusText}: ${path}`);
    }
    return res.json() as Promise<T>;
  }

  async listExpansions(
    page = 1,
    pageSize = 100,
  ): Promise<ScrydexListResponse<ScrydexExpansion>> {
    return this.get('/expansions', {
      page: String(page),
      page_size: String(pageSize),
      casing: 'snake',
    });
  }

  async listExpansionCards(
    expansionId: string,
    page = 1,
    pageSize = 100,
    includePrices = false,
  ): Promise<ScrydexListResponse<ScrydexCardBrief>> {
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      casing: 'snake',
    };
    if (includePrices) params.include = 'prices';
    return this.get(`/expansions/${expansionId}/cards`, params);
  }

  async listCards(
    page = 1,
    pageSize = 100,
    includePrices = false,
  ): Promise<ScrydexListResponse<ScrydexCardBrief>> {
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      casing: 'snake',
      orderBy: 'expansion_sort_order ASC',
    };
    if (includePrices) params.include = 'prices';
    return this.get('/cards', params);
  }

  // GET /cards/{id} — returns ScrydexCardFull. Use when the list endpoint's
  // brief shape is missing abilities/attacks/etc.
  async getCard(
    cardId: string,
    includePrices = false,
    includePopReports = false,
  ): Promise<ScrydexCardFull> {
    const params: Record<string, string> = { casing: 'snake' };
    const include = [
      includePrices ? 'prices' : null,
      includePopReports ? 'pop_reports' : null,
    ].filter(Boolean);
    if (include.length > 0) params.include = include.join(',');
    // GET /cards/{id} actually wraps the card in a { data: ... } envelope
    // (despite the docs saying single resources are unwrapped). Unwrap it,
    // tolerating both shapes so we're robust if Scrydex ever changes it.
    const resp = await this.get<{ data?: ScrydexCardFull } & ScrydexCardFull>(
      `/cards/${cardId}`,
      params,
    );
    return resp.data ?? resp;
  }

  // GET /cards/{id}/price_history.
  // Pass `startDate` to fetch all snapshots from that date forward — leave
  // both `days` and `startDate` undefined to let Scrydex apply its default.
  // For a "full history" backfill, pass startDate well before any modern
  // print run (e.g. '2010-01-01').
  async getCardPriceHistory(
    cardId: string,
    opts: { days?: number; startDate?: string; endDate?: string } = {},
  ): Promise<ScrydexPriceHistoryResponse> {
    const params: Record<string, string> = { casing: 'snake' };
    if (opts.days       != null) params.days       = String(opts.days);
    if (opts.startDate)          params.start_date = opts.startDate;
    if (opts.endDate)            params.end_date   = opts.endDate;
    return this.get(`/cards/${cardId}/price_history`, params);
  }

  // GET /cards/{id}/listings — sold-listing snapshots from eBay et al.
  async getCardListings(
    cardId: string,
    opts: { days?: number; page?: number; pageSize?: number } = {},
  ): Promise<ScrydexListingsResponse> {
    const params: Record<string, string> = {
      casing: 'snake',
      page:      String(opts.page     ?? 1),
      page_size: String(opts.pageSize ?? 100),
    };
    if (opts.days) params.days = String(opts.days);
    return this.get(`/cards/${cardId}/listings`, params);
  }
}

function parseHeaderInt(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
