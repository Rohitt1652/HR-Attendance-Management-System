'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getMe } from '@/api/authApi';

const AuthContext = createContext(null);

function setPortalTokenCookie(token) {
  if (typeof document === 'undefined' || !token) return;
  const maxAge = 7 * 24 * 60 * 60;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `portal_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function clearPortalTokenCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'portal_token=; path=/; max-age=0; SameSite=Lax';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  });
  const timeoutRef = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearPortalTokenCookie();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setPortalTokenCookie(newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const updateUser = useCallback((userData) => {
    // Preserve permissions if not included in the update (e.g., photo upload response)
    setUser(prev => {
      const merged = { ...prev, ...userData };
      if (!userData.permissions && prev?.permissions) {
        merged.permissions = prev.permissions;
      }
      localStorage.setItem('user', JSON.stringify(merged));
      return merged;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return null;
    const res = await getMe();
    if (res.data?.data) {
      const fresh = res.data.data;
      localStorage.setItem('user', JSON.stringify(fresh));
      setUser(fresh);
      return fresh;
    }
    return null;
  }, [token]);

  // Refresh user data and role permissions when returning to the browser tab.
  useEffect(() => {
    if (!token) return;
    getMe().then(res => {
      if (res.data?.data) {
        const fresh = res.data.data;
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      }
    }).catch(() => { /* silent — don't clear token on failure, stale data is fine */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    const refresh = () => refreshUser().catch(() => { /* keep cached user if refresh fails */ });
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [token, refreshUser]);

  useEffect(() => {
    if (token) setPortalTokenCookie(token);
    else clearPortalTokenCookie();
  }, [token]);

  useEffect(() => {
    const handle = () => logout();
    window.addEventListener('auth:logout', handle);
    return () => window.removeEventListener('auth:logout', handle);
  }, [logout]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const minutes = user?.inactivityTimeoutMinutes || 30;
    timeoutRef.current = setTimeout(logout, minutes * 60 * 1000);
  }, [logout, user]);

  useEffect(() => {
    if (!token) return;
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [token, resetTimer]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
