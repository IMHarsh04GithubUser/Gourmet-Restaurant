import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider } from './ui/context';
import { Header, Footer, Loading, Empty } from './ui/components';
import './ui/styles.css';
const Home = lazy(() => import('./ui/pages').then(m => ({ default: m.Home })));
const Menu = lazy(() => import('./ui/pages').then(m => ({ default: m.Menu })));
const About = lazy(() => import('./ui/pages').then(m => ({ default: m.About })));
const Contact = lazy(() => import('./ui/pages').then(m => ({ default: m.Contact })));
const Auth = lazy(() => import('./ui/pages').then(m => ({ default: m.Auth })));
const Club = lazy(() => import('./ui/club').then(m => ({ default: m.Club })));
const Quiz = lazy(() => import('./ui/club').then(m => ({ default: m.Quiz })));
const Checkout = lazy(() => import('./ui/checkout'));
const Orders = lazy(() => import('./ui/orders'));
function ScrollToPage() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) { window.scrollTo(0, 0); return; } const timer = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 250); return () => clearTimeout(timer); }, [pathname, hash]); return null;
}
function App() {
  return <BrowserRouter><StoreProvider><ScrollToPage /><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main"><Suspense fallback={<Loading />}><Routes><Route path="/" element={<Home />} /><Route path="/menu" element={<Menu />} /><Route path="/order" element={<Checkout />} /><Route path="/orders" element={<Orders />} /><Route path="/about" element={<About />} /><Route path="/contact" element={<Contact />} /><Route path="/login" element={<Auth />} /><Route path="/signup" element={<Auth signup />} /><Route path="/grocery" element={<Club />} /><Route path="/quiz" element={<Quiz />} /><Route path="*" element={<Empty title="This page wandered off." action="/" label="Back to home">Let's get you back to something delicious.</Empty>} /></Routes></Suspense></main><Footer /></StoreProvider></BrowserRouter>;
}
export default App;
