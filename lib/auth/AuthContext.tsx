import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  ensureDefaultCollections,
  flushPendingOps,
  pullCollectionsFromCloud,
} from '@/lib/db/cloud-sync';
import { prewarmFromLocalCollection } from '@/lib/api/sync-client';
import { avatarFor } from '@/lib/avatar';
import { User } from '@/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Map a Supabase auth user to our app-level User. user_metadata.full_name is
// the standard OAuth claim; we fall back gracefully on each step.
function sessionToUser(session: Session | null): User | null {
  const supaUser = session?.user;
  if (!supaUser) return null;

  const md = (supaUser.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (md.full_name as string | undefined) ??
    (md.name as string | undefined) ??
    (supaUser.email ? supaUser.email.split('@')[0] : 'Trainer');
  const handle = `@${(md.user_name as string | undefined) ?? fullName.split(' ')[0].toLowerCase()}`;

  return {
    id:     supaUser.id,
    name:   fullName,
    handle,
    email:  supaUser.email ?? '',
    avatar: avatarFor(supaUser.id),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    session: null,
  });
  // Tracks which user IDs we've already reconciled with the cloud this app
  // run, so the sync only fires once per sign-in (not on every TOKEN_REFRESHED).
  const reconciledUsers = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    function applySession(session: Session | null) {
      if (!mounted) return;
      setState({
        status: session ? 'authenticated' : 'unauthenticated',
        user:   sessionToUser(session),
        session,
      });
      const uid = session?.user.id;
      if (uid && !reconciledUsers.current.has(uid)) {
        reconciledUsers.current.add(uid);
        // Cloud is the authoritative source of truth for collections / binders
        // / wishlist. Pull replaces the SQLite mirror, ensures default rows
        // exist for new accounts, drains any queue left over from a previous
        // session, then prewarms pricing. All fire-and-forget.
        (async () => {
          try {
            await pullCollectionsFromCloud(uid);
            await ensureDefaultCollections(uid);
            await flushPendingOps();
            await prewarmFromLocalCollection();
          } catch (err) {
            console.warn('[auth] post-signin background work failed:', err);
          }
        })();
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    // Drain the offline write queue whenever the app comes back to the
    // foreground, plus on a 30s heartbeat so a long-lived foreground session
    // also catches up after a connectivity blip. Both are no-ops when the
    // queue is empty or a flush is already in flight (cloud-sync dedups).
    const onAppState = AppState.addEventListener('change', state => {
      if (state === 'active') flushPendingOps().catch(() => {});
    });
    const interval = setInterval(() => {
      flushPendingOps().catch(() => {});
    }, 30_000);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      onAppState.remove();
      clearInterval(interval);
    };
  }, []);

  async function logout(): Promise<void> {
    await supabase.auth.signOut();
    // onAuthStateChange handles state update.
  }

  return (
    <AuthContext.Provider value={{ ...state, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
