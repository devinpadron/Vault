// In-app notification inbox. Rows are written by the `notify` edge function
// (service role) alongside a push; here we read them and mark them read. The
// unread count backs the bell badge. Push delivery + the foreground refetch
// (focusManager in app/_layout.tsx) cover freshness; the interval is just a
// slow safety net while the app stays open.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const SELECT = 'id, type, title, body, data, read_at, created_at';

export function useNotifications() {
  const { user } = useAuth();
  return useQuery<AppNotification[]>({
    queryKey: ['notifications', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchInterval: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  return (data ?? []).filter(n => !n.read_at).length;
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}
