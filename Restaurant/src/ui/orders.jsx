import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RefreshCw, CheckCircle2, ArrowRight, PackageCheck } from 'lucide-react';
import { useStore } from './context';
import { api, money, payOnline, saveStored } from './api';
import { Empty, ErrorBox, Loading, PageTitle, Status } from './components';
export default function Orders() {
  const { session, authLoading, notify, clearCart } = useStore(); const location = useLocation();
  const [orders, setOrders] = useState([]), [page, setPage] = useState(1), [pages, setPages] = useState(1), [busy, setBusy] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(async () => { if (!session) return; setLoading(true); setError(''); try { const data = await api(`/api/orders?page=${page}`, { token: session.token }); setOrders(data.data); setPages(data.pages); } catch (err) { setError(err.message); } finally { setLoading(false); } }, [session?.token, page]);
  useEffect(() => { load(); }, [load]);
  const update = order => setOrders(old => old.map(x => x._id === order._id ? order : x));
  async function refresh(order) { setBusy(order._id); setError(''); try { const result = await api(`/api/orders/${order._id}/reconcile`, { token: session.token, method: 'POST' }); update(result.order); notify(result.order.paymentStatus === 'paid' ? 'Payment confirmed.' : 'Payment status updated.'); } catch (err) { setError(err.message); } finally { setBusy(''); } }
  async function resume(order) {
    setBusy(order._id); setError('');
    try {
      const current = await api(`/api/orders/${order._id}/reconcile`, { token: session.token, method: 'POST' });
      update(current.order);
      if (current.order.status !== 'awaiting_payment') { notify('This order is already confirmed.'); return; }
      const checkout = await api(`/api/orders/${order._id}/checkout`, { token: session.token, method: 'POST' });
      const result = await payOnline(checkout, session.token);
      if (result.cancelled) { notify('Payment window closed. You can retry this order.'); return; }
      update(result.order);
      notify(result.order.paymentStatus === 'paid' ? 'Payment verified. Your meal is on its way to the kitchen.' : 'Confirmation is pending. Check payment status shortly.');
      // Do not clear the current basket here: it may contain a different, newer order.
      if (result.order.paymentStatus === 'paid') saveStored(`gg-checkout-${session.user.id}`, null);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }
  if (authLoading) return <Loading />;
  if (!session) return <Empty title="Your meals, all in one place." action="/login?next=/orders" label="Sign in">Sign in to view your orders and payment status.</Empty>;
  return <div className="shell section orders-page"><div className="section-heading"><PageTitle eyebrow="FROM OUR KITCHEN TO YOUR DOOR" title="My orders.">Track your meals and pick up where you left off.</PageTitle><button className="button button-outline" disabled={loading || Boolean(busy)} onClick={load}><RefreshCw size={16} />Refresh</button></div>{location.state?.newOrder && <div className="success-banner"><CheckCircle2 /><div><strong>Thanks! Your order is placed.</strong><p>You'll find the details and latest status below.</p></div></div>}{error && <ErrorBox message={error} retry={load} />}{loading ? <Loading /> : orders.length ? <div className="order-list">{orders.map(order => <article className="panel order-card" key={order._id}><div className="order-card-header"><div><span className="eyebrow">ORDER #{order._id.slice(-8).toUpperCase()}</span><p>{new Date(order.createdAt).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}</p></div><div className="status-row"><Status value={order.status} /><Status value={order.paymentStatus} /></div></div><div className="order-details"><div>{order.items.map((item,i) => <p key={i}><strong>{item.quantity} ×</strong> {item.name} <span>{money(item.quantity * item.unitPricePaise)}</span></p>)}</div><div><h4>Delivery to {order.customer.name}</h4><p>{order.customer.address}</p><p>{order.customer.phone}</p></div></div><div className="order-card-footer"><div><small>{order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Razorpay'} · Delivery {money(order.deliveryPaise)}</small><strong>{money(order.totalPaise)}</strong>{order.refundPaise > 0 && <small>Refunded: {money(order.refundPaise)}</small>}</div><div className="order-actions">{order.paymentMethod === 'razorpay' && <button className="button button-outline" disabled={Boolean(busy)} onClick={() => refresh(order)}><RefreshCw size={15} />{busy === order._id ? 'Checking…' : 'Check payment'}</button>}{order.status === 'awaiting_payment' && <button className="button" disabled={Boolean(busy)} onClick={() => resume(order)}>Resume payment <ArrowRight size={16} /></button>}</div></div>{order.status === 'awaiting_payment' && <p className="info-note">Payment is not confirmed yet. If your account was debited, check payment status before paying again.</p>}</article>)}<div className="pagination"><button className="button button-outline" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Previous</button><span>Page {page} of {pages || 1}</span><button className="button button-outline" disabled={page >= pages} onClick={() => setPage(p => p+1)}>Next</button></div></div> : !error && <Empty title="Your first favourite is waiting.">Once you place an order, you'll find it here.</Empty>}</div>;
}
