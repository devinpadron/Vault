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

export interface ScrydexVariant {
  name: string;
  prices: ScrydexPrice[];
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
  language_code: string;
  expansion_sort_order: number;
  variants?: ScrydexVariant[];
}

export interface ScrydexCardFull extends ScrydexCardBrief {
  abilities?: Array<{ type: string; name: string; text: string }>;
  attacks?: Array<{ cost: string[]; converted_energy_cost: number; name: string; text: string; damage: string }>;
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreat_cost?: string[];
  converted_retreat_cost?: string;
  flavor_text?: string;
  regulation_mark?: string;
  national_pokedex_numbers?: number[];
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

// ─── Client ───────────────────────────────────────────────────────────────────

export class ScrydexClient {
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

  async getCardPriceHistory(
    cardId: string,
    days = 2,
  ): Promise<ScrydexPriceHistoryResponse> {
    return this.get(`/cards/${cardId}/price_history`, {
      days: String(days),
      casing: 'snake',
    });
  }
}
