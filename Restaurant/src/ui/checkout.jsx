import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, LockKeyhole, Banknote, Trash2, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useStore } from './context';
import { api, imageUrl, money, payOnline, readStored, saveStored } from './api';
import { PageTitle, Photo, Quantity, OrderSummary, ErrorBox, Empty, Loading } from './components';
export default function Checkout() {
  const { cart, quantity, clearCart, session, authLoading, authError, config, notify } = useStore();
  const [quote, setQuote] = useState(null), [quoteLoading, setQuoteLoading] = useState(false), [error, setError] = useState(''), [quoteError, setQuoteError] = useState(''), [retry, setRetry] = useState(0);
  const [method, setMethod] = useState('cod'), [busy, setBusy] = useState(false), [delivery, setDelivery] = useState({ name: '', phone: '', address: '' });
  const submitLock = useRef(false); const navigate = useNavigate();
  const itemKey = JSON.stringify(cart.map(x => ({ id: x.id, quantity: x.quantity })));
  useEffect(() => { if (session?.user) setDelivery(old => ({ ...old, name: old.name || session.user.uname, address: old.address || session.user.address || '' })); }, [session?.user]);
  useEffect(() => {
    if (itemKey === '[]') { setQuote(null); return; }
    const controller = new AbortController(); setQuoteLoading(true); setQuoteError(''); setQuote(null);
    api('/api/checkout/quote', { method: 'POST', body: { items: JSON.parse(itemKey) }, signal: controller.signal }).then(setQuote).catch(e => { if (e.name !== 'AbortError') setQuoteError(e.message); }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    return () => controller.abort();
  }, [itemKey, retry]);
  async function submit(e) {
    e.preventDefault(); if (submitLock.current || !quote) return; submitLock.current = true; setBusy(true); setError('');
    const body = { items: JSON.parse(itemKey), paymentMethod: method, ...delivery };
    const key = `gg-checkout-${session.user.id}`;
    const fingerprint = JSON.stringify(body);
    const saved = readStored(key, null);
    const idempotencyKey = saved?.fingerprint === fingerprint ? saved.id : crypto.randomUUID();
    saveStored(key, { fingerprint, id: idempotencyKey });
    try {
      const checkout = await api('/api/checkout/orders', { token: session.token, method: 'POST', body: { ...body, idempotencyKey, expectedTotalPaise: quote.totalPaise } });
      const result = method === 'razorpay' ? await payOnline(checkout, session.token) : checkout;
      if (result.cancelled) { setError('Payment window closed. Your basket and order are saved. You can retry without creating a duplicate order.'); return; }
      if (result.order.status === 'awaiting_payment') { notify('Payment confirmation is pending. Check My orders before paying again.'); navigate('/orders'); return; }
      clearCart(); saveStored(key, null); notify(method === 'cod' ? 'Your order is placed. Pay when it arrives.' : 'Payment verified. Your order is placed.'); navigate('/orders', { state: { newOrder: result.order._id } });
    } catch (err) {
      setError(err.message);
      if (err.status === 409) setRetry(n => n + 1);
      if (err.status === 401) navigate('/login?next=/order');
    } finally { submitLock.current = false; setBusy(false); }
  }
  if (authLoading) return <Loading text="Checking your account…" />;
  if (!cart.length) return <Empty title="Your basket is waiting." >Let's fill it with something you'll love.</Empty>;
  return <div className="shell section"><Link className="text-link back-link" to="/menu"><ArrowLeft size={16} /> Back to the menu</Link><PageTitle eyebrow="ONE STEP CLOSER TO SOMETHING DELICIOUS" title="Your basket.">A little of this. A little of that. A whole lot of good.</PageTitle><div className="checkout-layout"><div><section className="panel basket-panel"><div className="panel-heading"><h2>Your meal</h2><span>{cart.reduce((n,x) => n+x.quantity,0)} items</span></div>{cart.map(item => <div className="basket-item" key={item.id}><Photo src={imageUrl(item.image)} alt={item.name} width="90" height="90" loading="lazy" /><div className="basket-item-info"><h3>{item.name}</h3><span>{money(quote?.items.find(x => x.productId === item.id)?.unitPricePaise ?? Math.round(item.price * 100))} each</span><Quantity value={item.quantity} onChange={n => quantity(item.id,n)} name={item.name} disabled={busy} /></div><div className="basket-item-right"><strong>{money((quote?.items.find(x => x.productId === item.id)?.unitPricePaise ?? Math.round(item.price * 100)) * item.quantity)}</strong><button className="icon-button" disabled={busy} onClick={() => quantity(item.id,0)} aria-label={`Remove ${item.name}`}><Trash2 size={17} /></button></div></div>)}<Link className="text-link" to="/menu">Add something else <ArrowRight size={16} /></Link></section><div className="checkout-assurance"><ShieldCheck size={22} /><p>Your order total is checked before payment.<br /><span>Online payments are handled by Razorpay.</span></p></div></div><aside className="checkout-aside"><form className="panel" onSubmit={submit}><span className="eyebrow">THE FINAL DETAILS</span><h2>Let's get it to you.</h2>{error && <ErrorBox message={error} />}{error && <Link className="text-link" to="/orders">Check My orders <ArrowRight size={16} /></Link>}{authError && <ErrorBox message={authError} />}{quoteError && <ErrorBox message={quoteError} retry={() => setRetry(n => n+1)} />}{quoteLoading ? <Loading text="Checking current prices…" /> : quote && <OrderSummary quote={quote} />}{session ? <fieldset disabled={busy}><label>Recipient name<input name="name" required minLength={2} maxLength={80} autoComplete="name" value={delivery.name} onChange={e => setDelivery({...delivery,name:e.target.value})} /></label><label>Mobile number<input type="tel" name="phone" required pattern="(?:\+91)?[6-9][0-9]{9}" placeholder="10-digit mobile number" autoComplete="tel" value={delivery.phone} onChange={e => setDelivery({...delivery,phone:e.target.value})} /></label><label>Delivery address<textarea name="address" required minLength={10} maxLength={500} rows={3} autoComplete="street-address" placeholder="House / flat, street, area, city and PIN code" value={delivery.address} onChange={e => setDelivery({...delivery,address:e.target.value})} /></label><p className="account-note">Order account: {session.user.email}</p><fieldset className="payment-options"><legend>How would you like to pay?</legend><label className={method === 'cod' ? 'payment-option selected' : 'payment-option'}><input type="radio" name="paymentMethod" checked={method === 'cod'} onChange={() => setMethod('cod')} /><Banknote size={22} /><span><strong>Cash on delivery</strong><small>Pay when your meal arrives</small></span></label><label className={`payment-option ${method === 'razorpay' ? 'selected' : ''} ${!config?.onlinePaymentEnabled ? 'unavailable' : ''}`}><input type="radio" name="paymentMethod" checked={method === 'razorpay'} disabled={!config?.onlinePaymentEnabled} onChange={() => setMethod('razorpay')} /><CreditCard size={22} /><span><strong>Pay online {config?.paymentMode === 'test' && <span className="test-badge">Test mode</span>}</strong><small>{config?.onlinePaymentEnabled ? 'UPI, cards & more via Razorpay' : 'Online payments are currently unavailable'}</small></span></label></fieldset>{config?.paymentMode === 'test' && method === 'razorpay' && <p className="info-note">Test checkout — no real payment is collected.</p>}<button className="button full" type="submit" disabled={!quote || quoteLoading || busy || Boolean(authError)}>{busy ? 'Processing your order…' : method === 'razorpay' ? `Pay ${money(quote?.totalPaise)}` : 'Place order'}{method === 'razorpay' ? <LockKeyhole size={17} /> : <ArrowRight size={18} />}</button></fieldset> : <div className="signin-prompt"><ShoppingBag size={25} /><h3>A quick sign-in, then dinner.</h3><p>Your basket will stay right here.</p><Link className="button full" to="/login?next=/order">Sign in to checkout <ArrowRight size={17} /></Link></div>}<p className="safe-note"><LockKeyhole size={13} /> Your card details are never stored by us.</p></form></aside></div></div>;
}
