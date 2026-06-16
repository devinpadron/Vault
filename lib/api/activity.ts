// Activity feed. Friend-visible events (added a notable card, hit a set
// milestone, published a binder), newest first. RLS on activity_events scopes
// rows to the caller's accepted friends + themselves, so a plain select returns
// the right set. Polled (no realtime); capped at the most recent events.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
import { Profile } from './profiles';
import { CARD_SELECT, SupabaseCardFull, mapRow } from './types';
import { Card } from '@/types';

export type ActivityType = 'card_added' | 'set_milestone' | 'binder_published';

export interface ActivityActor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  createdAt: string;
  actor: ActivityActor;
  card: Card | null;        // populated for card_added
  data: Record<string, unknown>;
}

const FEED_LIMIT = 60;

export function useActivityFeed() {
  const { user } = useAuth();
  return useQuery<ActivityItem[]>({
    queryKey: ['activity-feed', user?.id],
    enabled: !!user?.id,
    // Push + foreground refetch (focusManager) keep this fresh; the interval
    // is a slow safety net while the screen stays open.
    refetchInterval: 1000 * 60 * 5,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('activity_events')
        .select('id, actor_id, type, data, created_at')
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (error) throw error;
      type Row = {
        id: string; actor_id: string; type: ActivityType;
        data: Record<string, unknown>; created_at: string;
      };
      const rows = (events ?? []) as Row[];
      if (rows.length === 0) return [];

      // Actor profiles in one round trip.
      const actorIds = Array.from(new Set(rows.map(r => r.actor_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, created_at, updated_at')
        .in('id', actorIds);
      const profById = new Map<string, Profile>((profs as Profile[] ?? []).map(p => [p.id, p]));

      // Cards referenced by card_added events in one round trip.
      const cardIds = Array.from(new Set(
        rows.filter(r => r.type === 'card_added' && typeof r.data.card_id === 'string')
          .map(r => r.data.card_id as string),
      ));
      const cardById = new Map<string, Card>();
      if (cardIds.length > 0) {
        const { data: cards } = await supabase
          .from('cards').select(CARD_SELECT).in('id', cardIds);
        for (const c of ((cards ?? []) as unknown as SupabaseCardFull[])) {
          const card = mapRow(c);
          cardById.set(card.id, card);
        }
      }

      return rows.map(r => {
        const p = profById.get(r.actor_id);
        const cardId = typeof r.data.card_id === 'string' ? r.data.card_id : null;
        return {
          id: r.id,
          type: r.type,
          createdAt: r.created_at,
          actor: {
            id: r.actor_id,
            name: p?.display_name?.trim() || p?.username || 'Trainer',
            username: p?.username ?? '',
            avatarUrl: p?.avatar_url ?? null,
          },
          card: cardId ? cardById.get(cardId) ?? null : null,
          data: r.data,
        };
      });
    },
  });
}

// Emit an activity event for the current user. Insert RLS requires
// actor_id = auth.uid(), so callers can only post their own activity.
export async function emitActivity(
  actorId: string,
  type: ActivityType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('activity_events').insert({ actor_id: actorId, type, data });
  } catch {
    /* feed is best-effort */
  }
}
