'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from './api';

const AuthContext = createContext(null);
const AUTH_SYNC_KEY = 'ogtb-auth-sync';

function publishAuthSync(type) {
  try {
    window.localStorage.setItem(
      AUTH_SYNC_KEY,
      JSON.stringify({ type, at: Date.now() }),
    );
  } catch {
    // Auth still works when storage is unavailable; cross-tab sync is best effort.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api('/api/auth/me');
      setUser(result.user);
      return result.user;
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    api('/api/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((error) => {
        if (active && error.status === 401) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleStorage(event) {
      if (event.key !== AUTH_SYNC_KEY || !event.newValue) return;

      try {
        const message = JSON.parse(event.newValue);
        if (message.type === 'logout') {
          setUser(null);
          setLoading(false);
          return;
        }
        if (message.type === 'login') {
          refresh({ quiet: true }).catch(() => {});
        }
      } catch {
        // Ignore malformed or unrelated storage values.
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setLoading(false);
    publishAuthSync('logout');
  }, []);

  const setSessionUser = useCallback((nextUser) => {
    setUser(nextUser || null);
    setLoading(false);
    publishAuthSync(nextUser ? 'login' : 'logout');
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    refresh,
    logout,
    setSessionUser,
  }), [user, loading, refresh, logout, setSessionUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
