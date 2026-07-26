import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore, User } from '../api';
import { connectSocket, disconnectSocket } from '../api/socket';

interface AuthState {
  ready: boolean;
  user: User | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (
    inviteCode: string,
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    tokenStore.setOnUnauthorized(() => setUser(null));
    (async () => {
      await tokenStore.load();
      if (tokenStore.getAccess()) {
        try {
          setUser(await api.me());
          connectSocket();
        } catch {
          await tokenStore.clear();
        }
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    await tokenStore.set(res.tokens);
    setUser(res.user);
    connectSocket();
  }, []);

  const signUp = useCallback(
    async (inviteCode: string, username: string, password: string, displayName: string) => {
      const res = await api.register(inviteCode, username, password, displayName);
      await tokenStore.set(res.tokens);
      setUser(res.user);
      connectSocket();
    },
    [],
  );

  const signOut = useCallback(async () => {
    const r = tokenStore.getRefresh();
    if (r) await api.logout(r).catch(() => undefined);
    disconnectSocket();
    await tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    setUser(await api.me());
  }, []);

  return (
    <AuthContext.Provider value={{ ready, user, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
