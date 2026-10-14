import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, readStored, saveStored } from './api';
const Store = createContext(null);
export const useStore = () => useContext(Store);
export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const saved = readStored('gg-cart-v2', []);
    return Array.isArray(saved) ? saved.filter(x => typeof x.id === 'string' && /^[a-f\d]{24}$/i.test(x.id) && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 20 && Number.isFinite(x.price) && typeof x.name === 'string').slice(0, 50) : [];
  });
  const [session, setSession] = useState(() => readStored('gg-session-v2', null, sessionStorage));
  const [authLoading, setAuthLoading] = useState(Boolean(session?.token));
  const [authError, setAuthError] = useState('');
  const [config, setConfig] = useState(null);
  const [notice, setNotice] = useState('');
  const notify = useCallback(message => setNotice(message), []);
  const signOut = useCallback(() => { setSession(null); saveStored('gg-session-v2', null, sessionStorage); setAuthLoading(false); setAuthError(''); }, []);
  const signIn = useCallback(data => { setSession(data); saveStored('gg-session-v2', data, sessionStorage); setAuthError(''); }, []);
  useEffect(() => { window.addEventListener('gg-session-expired', signOut); return () => window.removeEventListener('gg-session-expired', signOut); }, [signOut]);
  useEffect(() => { saveStored('gg-cart-v2', cart); }, [cart]);
  useEffect(() => { api('/api/config').then(setConfig).catch(() => setConfig(null)); }, []);
  useEffect(() => {
    if (!session?.token) { setAuthLoading(false); return; }
    const controller = new AbortController();
    api('/api/me', { token: session.token, signal: controller.signal }).then(data => { setSession(prev => ({ ...prev, user: data.user })); setAuthError(''); }).catch(error => { if (error.name === 'AbortError') return; if (error.status === 401) signOut(); else setAuthError(error.message); }).finally(() => { if (!controller.signal.aborted) setAuthLoading(false); });
    return () => controller.abort();
  }, [session?.token, signOut]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  const add = useCallback(item => {
    setCart(old => {
      const existing = old.find(x => x.id === item._id);
      if (existing) return old.map(x => x.id === item._id ? { ...x, quantity: Math.min(20, x.quantity + 1) } : x);
      if (old.length >= 50) return old;
      return [...old, { id: item._id, name: item.name, price: item.price, image: item.image, quantity: 1 }];
    });
    notify(`${item.name} added to your basket`);
  }, [notify]);
  const quantity = useCallback((id, value) => setCart(old => old.map(x => x.id === id ? { ...x, quantity: Math.max(0, Math.min(20, value)) } : x).filter(x => x.quantity > 0)), []);
  const clearCart = useCallback(() => setCart([]), []);
  const value = useMemo(() => ({ cart, add, quantity, clearCart, count: cart.reduce((n, x) => n + x.quantity, 0), subtotal: cart.reduce((n, x) => n + Math.round(x.price * 100) * x.quantity, 0), session, signIn, signOut, authLoading, authError, config, notify }), [cart, add, quantity, clearCart, session, signIn, signOut, authLoading, authError, config, notify]);
  return <Store.Provider value={value}>{children}<div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice}</div></Store.Provider>;
}
