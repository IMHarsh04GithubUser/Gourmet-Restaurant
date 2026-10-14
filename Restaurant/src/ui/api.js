export const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://gourmet-restaurant-1.onrender.com' : 'http://localhost:3000')).replace(/\/$/, '');
export const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format((paise || 0) / 100);
export const imageUrl = value => value?.startsWith('/media/') || value?.startsWith('/uploads/') ? `${API_URL}${value}` : value ? `${API_URL}/uploads/${encodeURIComponent(value)}` : '/placeholder.svg';
export async function api(path, { token, body, method = 'GET', signal, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const form = body instanceof FormData;
    const response = await fetch(`${API_URL}${path}`, { ...options, method, signal: controller.signal, headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? (form ? body : JSON.stringify(body)) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401 && token) window.dispatchEvent(new Event('gg-session-expired')); const error = new Error(data.message || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') { if (signal?.aborted) throw error; throw new Error('The request timed out. Check My orders before submitting again.'); }
    if (error instanceof TypeError) throw new Error('Cannot reach the restaurant. Please check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
export function readStored(key, fallback, storage = localStorage) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function saveStored(key, value, storage = localStorage) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable in private mode. */ } }
let checkoutScript;
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    const timer = setTimeout(() => { script.remove(); checkoutScript = null; reject(new Error('Payment checkout timed out. Please try again.')); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.Razorpay) resolve(); else { checkoutScript = null; reject(new Error('Payment checkout is unavailable.')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); checkoutScript = null; reject(new Error('Payment checkout could not load. Check your connection and try again.')); };
    document.body.appendChild(script);
  });
  return checkoutScript;
}
export async function payOnline(session, token) {
  if (!session.checkout) return { order: session.order };
  await loadCheckout();
  return new Promise((resolve, reject) => {
    let settled = false;
    const checkout = new window.Razorpay({
      ...session.checkout, name: 'Gourmat Garden', description: `Order ${session.order._id.slice(-8).toUpperCase()}`,
      prefill: { name: session.order.customer.name, email: session.order.customer.email, contact: session.order.customer.phone }, theme: { color: '#214b3a' },
      handler: async response => {
        if (settled) return; settled = true;
        try { resolve(await api('/api/payments/verify', { token, method: 'POST', body: { orderId: session.order._id, ...response } })); }
        catch (error) { error.orderId = session.order._id; reject(error); }
      },
      modal: { ondismiss: () => { if (!settled) { settled = true; resolve({ cancelled: true, order: session.order }); } } },
    });
    checkout.on('payment.failed', () => { if (!settled) { settled = true; checkout.close(); reject(new Error('Payment was not completed. Your cart is saved; you can retry this order.')); } });
    checkout.open();
  });
}
