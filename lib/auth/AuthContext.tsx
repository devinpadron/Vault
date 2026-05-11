import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@/types';
import { saveAuth, loadAuth, clearAuth } from './storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    token: null,
  });

  useEffect(() => {
    loadAuth().then(result => {
      if (result) {
        setState({ status: 'authenticated', user: result.user, token: result.token });
      } else {
        setState({ status: 'unauthenticated', user: null, token: null });
      }
    });
  }, []);

  async function login(token: string, user: User): Promise<void> {
    await saveAuth(token, user);
    setState({ status: 'authenticated', user, token });
  }

  async function logout(): Promise<void> {
    await clearAuth();
    setState({ status: 'unauthenticated', user: null, token: null });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
