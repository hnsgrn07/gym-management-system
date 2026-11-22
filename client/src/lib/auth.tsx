import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, clearLocalData, setCacheScope } from './api';
import { setCurrency } from './format';
import type { PublicSettings, User } from './types';

interface AuthState {
  user: User | null;
  settings: PublicSettings;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const FALLBACK: PublicSettings = {
  gym_name: 'Gym', currency: 'USD', walkin_fee: 0, walkin_self_service: true, open_hours: '', demo_mode: false, expiring_days: 7,
};
const SESSION_KEY = 'gym:session';

const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);

/** The signed-in user is kept locally so the app still opens while the server is unreachable. */
function readSaved(): { user: User | null; settings: PublicSettings } | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['auth/me'],
    queryFn: async () => {
      try {
        const r = await api<{ user: User | null; settings: PublicSettings }>('/auth/me');
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(r)); } catch { /* ignore */ }
        return r;
      } catch (err) {
        const saved = readSaved();
        if (saved) return saved;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const user = me.data?.user ?? null;
  const settings = me.data?.settings ?? FALLBACK;
  setCacheScope(user?.id ?? null);
  setCurrency(settings.currency);

  useEffect(() => {
    document.title = settings.gym_name;
  }, [settings.gym_name]);

  const value: AuthState = {
    user,
    settings,
    loading: me.isLoading,
    refresh: () => me.refetch(),
    async login(username, password) {
      await api('/auth/login', { method: 'POST', body: { username, password } });
      qc.clear();
      await me.refetch();
    },
    async logout() {
      try {
        await api('/auth/logout', { method: 'POST' });
      } finally {
        clearLocalData();
        qc.clear();
        await me.refetch();
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
