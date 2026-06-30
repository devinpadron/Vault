import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  ensureDefaultCollections,
  flushPendingOps,
  pullCollectionsFromCloud,
  wipeIfForeignUserData,
  wipeLocalUserData,
} from '@/lib/db/cloud-sync';
import { prewarmFromLocalCollection } from '@/lib/api/sync-client';
import { registerPushToken, unregisterPushToken } from '@/lib/notifications/push';
import { avatarFor } from '@/lib/avatar';
import { User } from '@/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

// The cloud → local mirror pull runs once per sign-in. Track its state so the
// UI can show a retry affordance instead of silently rendering an empty
// "no cards yet" state when the network blip cost us the pull.
type MirrorSyncState = 'idle' | 'pulling' | 'ready' | 'error';

// Why the user is currently unauthenticated. 'manual' = they signed out via
// the Settings → Sign out button. 'expired' = Supabase token-refresh failed
// while the app was running. Welcome screen surfaces a one-liner on expired.
type SignedOutReason = 'manual' | 'expired';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  mirrorSync: { state: MirrorSyncState; error: Error | null };
  signedOutReason: SignedOutReason | null;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
  retryMirrorSync: () => void;
  clearSignedOutReason: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Minimum gap between price prewarms. The sign-in prewarm covers launch; this
// throttles the foreground re-prewarm so a quick app-switch doesn't re-hit
// Scrydex, while a long-lived session still refreshes owned-card prices.
const PREWARM_THROTTLE_MS = 30 * 60 * 1000; // 30 min

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
    mirrorSync: { state: 'idle', error: null },
    signedOutReason: null,
  });
  // Tracks which user IDs we've already reconciled with the cloud this app
  // run, so the sync only fires once per sign-in (not on every TOKEN_REFRESHED).
  const reconciledUsers = useRef<Set<string>>(new Set());
  // Distinguishes manual logout (sets the flag) from a Supabase-driven
  // sign-out (token expiry / refresh failure / server-side revoke).
  const manualSignOut = useRef(false);
  // Whether the previous applySession call saw an authenticated session —
  // lets us detect the authenticated → unauthenticated transition outside
  // the setState updater so the local wipe runs exactly once per sign-out.
  const wasAuthenticated = useRef(false);
  // Epoch ms of the last pricing prewarm, so the foreground refresh can throttle.
  const lastPrewarmAt = useRef(0);
  const queryClient = useQueryClient();

  async function runPostSigninSync(uid: string) {
    setState(s => ({ ...s, mirrorSync: { state: 'pulling', error: null } }));
    try {
      // If the device still holds another account's mirror (previous session
      // ended without a clean sign-out), purge it before pulling.
      await wipeIfForeignUserData(uid);
      await pullCollectionsFromCloud(uid);
      await ensureDefaultCollections(uid);
      await flushPendingOps();
      // Mirror is now populated — invalidate all cached queries so the UI
      // refetches from the freshly-loaded SQLite mirror instead of keeping
      // the empty results from queries that ran before the pull completed.
      queryClient.invalidateQueries();
      lastPrewarmAt.current = Date.now();
      prewarmFromLocalCollection().catch(err => {
        if (__DEV__) console.warn('[auth] prewarm failed:', err);
      });
      // Register this device for push (activity, friend requests). Best-effort —
      // a no-op on simulators / when permission is denied.
      registerPushToken(uid).catch(err => {
        if (__DEV__) console.warn('[auth] push registration failed:', err);
      });
      setState(s => ({ ...s, mirrorSync: { state: 'ready', error: null } }));
    } catch (err) {
      if (__DEV__) console.warn('[auth] post-signin sync failed:', err);
      setState(s => ({
        ...s,
        mirrorSync: { state: 'error', error: err as Error },
      }));
    }
  }

  useEffect(() => {
    let mounted = true;

    function applySession(session: Session | null) {
      if (!mounted) return;
      const isAuthed = !!session;
      if (wasAuthenticated.current && !isAuthed) {
        // Sign-out (manual or expiry): purge per-user local state so the next
        // account on this device can't read this user's mirror or flush their
        // queued mutations under different credentials.
        reconciledUsers.current.clear();
        queryClient.clear();
        wipeLocalUserData().catch(err => {
          if (__DEV__) console.warn('[auth] local wipe on sign-out failed:', err);
        });
      }
      wasAuthenticated.current = isAuthed;
      setState(prev => {
        const next: AuthStatus = session ? 'authenticated' : 'unauthenticated';
        let signedOutReason = prev.signedOutReason;
        if (prev.status === 'authenticated' && next === 'unauthenticated') {
          signedOutReason = manualSignOut.current ? 'manual' : 'expired';
          manualSignOut.current = false;
        } else if (next === 'authenticated') {
          // Fresh sign-in clears any stale expired-banner state.
          signedOutReason = null;
        }
        return {
          ...prev,
          status: next,
          user: sessionToUser(session),
          session,
          signedOutReason,
        };
      });
      const uid = session?.user.id;
      if (uid && !reconciledUsers.current.has(uid)) {
        reconciledUsers.current.add(uid);
        // Cloud is the authoritative source of truth for collections / binders
        // / wishlist. Pull replaces the SQLite mirror, ensures default rows
        // exist for new accounts, drains any queue left over from a previous
        // session, then prewarms pricing. Surfaces sync state through
        // AuthContext so the UI can show a retry banner on failure.
        //
        // Defer out of the caller's stack with setTimeout(0): applySession runs
        // synchronously inside the supabase onAuthStateChange callback, which
        // holds an internal auth lock. Calling supabase.from()/auth.getUser()
        // from runPostSigninSync while that lock is held deadlocks — the pull
        // hangs forever and the mirror is never populated, so a fresh sign-in
        // renders an empty collection. Running it on the next tick releases the
        // lock first. (See supabase-js onAuthStateChange guidance.)
        setTimeout(() => {
          runPostSigninSync(uid);
        }, 0);
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
    const onAppState = AppState.addEventListener('change', appStatus => {
      if (appStatus !== 'active') return;
      flushPendingOps().catch(() => {});
      // Re-prewarm owned-card prices on foreground, throttled — keeps the
      // collection's prices current through a long-lived session (the sign-in
      // prewarm only covers launch). Best-effort; no-op when signed out.
      if (wasAuthenticated.current && Date.now() - lastPrewarmAt.current >= PREWARM_THROTTLE_MS) {
        lastPrewarmAt.current = Date.now();
        prewarmFromLocalCollection().catch(err => {
          if (__DEV__) console.warn('[auth] foreground prewarm failed:', err);
        });
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout(): Promise<void> {
    manualSignOut.current = true;
    // Drop this device's push token while still authenticated (RLS needs it).
    await unregisterPushToken().catch(() => {});
    await supabase.auth.signOut();
    // onAuthStateChange handles state update; manualSignOut.current is
    // consumed there and reset to false.
  }

  function retryMirrorSync(): void {
    const uid = state.session?.user.id;
    if (!uid) return;
    // Force re-reconciliation by removing from the cache.
    reconciledUsers.current.delete(uid);
    runPostSigninSync(uid);
  }

  function clearSignedOutReason(): void {
    setState(s => (s.signedOutReason ? { ...s, signedOutReason: null } : s));
  }

  return (
    <AuthContext.Provider
      value={{ ...state, logout, retryMirrorSync, clearSignedOutReason }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
