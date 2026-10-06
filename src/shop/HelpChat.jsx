// Customer service chat (customer side): "Contact customer service" opens this page.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call, getToken } from './api';
import { peso, pad } from '../lib/format';
import { shrinkImage } from '../lib/shrinkImage';
import './help.css';

const TOPIC_ICON = {
  Payment: <path d="M3 7h18v10H3zM3 11h18M7 15h3" />,
  'My order': <path d="M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2" />,
  Delivery: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  'Cancel or change': <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M9 9l6 6m0-6-6 6" />,
  Account: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  'Something else': <path d="M12 21a9 9 0 1 0-8-4.9L3 21l4.9-1A9 9 0 0 0 12 21Zm-4-9h.01M12 12h.01M16 12h.01" />,
};
const STATUS = { awaiting_payment: 'Waiting for payment', new: 'Received', preparing: 'Preparing', ready: 'Ready', paid: 'Done', cancelled: 'Cancelled' };
const TEXT_MAX = 1000;

const timeOf = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const dayOf = (d) => {
  const f = (x) => new Date(x).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  if (f(d) === f(Date.now())) return 'Today';
  if (f(d) === f(Date.now() - 864e5)) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};

/** A picture in the chat (loaded with the customer's sign-in) */
function ChatImg({ id, local, onOpen }) {
  const [url, setUrl] = useState(local || '');
  useEffect(() => {
    if (local) return undefined;
    let live = true, u = '';
    fetch(`/api/help/img/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch(() => {});
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id, local]);
  return url
    ? <button type="button" className="hc-img" onClick={() => onOpen(url)}><img src={url} alt="Attached" /></button>
    : <span className="hc-img loading" aria-label="Loading picture" />;
}

export default function HelpChat({ me, go, orders, shop, onSeen }) {
  const params = new URLSearchParams(window.location.search);
  const [orderCode, setOrderCode] = useState(params.get('order') || '');
  const [data, setData] = useState(null); // { thread, messages, topics }
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [pic, setPic] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState('');
  const list = useRef(null);
  const box = useRef(null);
  const fileIn = useRef(null);
  const atBottom = useRef(true);

  const load = useCallback(() => call('GET', '/help')
    .then((d) => { setData((prev) => (prev && JSON.stringify(prev.messages.map((m) => m._id)) === JSON.stringify(d.messages.map((m) => m._id)) && prev.thread?.status === d.thread?.status ? prev : d)); setErr(''); onSeen?.(); })
    .catch((e) => setErr(e.message)), [onSeen]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  // Stay at the newest message (unless the customer scrolled up to read)
  useLayoutEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);
  const onScroll = () => { const el = list.current; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  // Grow the text box with the message
  useLayoutEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; } }, [text]);

  const order = orderCode ? orders.find((o) => o.code === orderCode) : null;
  const thread = data?.thread;
  const starting = data && (!thread || thread.status === 'resolved');
  const msgs = data?.messages || [];

  const attach = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { setPic(await shrinkImage(f)); setErr(''); }
    catch (x) { setErr(x.message === 'big' ? 'That picture is too big. Try a screenshot instead.' : 'That file isn’t a picture. Choose a photo or screenshot.'); }
  };

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if ((!t && !pic) || sending) return;
    setSending(true); setErr('');
    const temp = { _id: 'tmp' + Date.now(), from: 'customer', text: t, at: new Date().toISOString(), img: !!pic, local: pic, orderNo: order?.no ?? null, pending: true };
    atBottom.current = true;
    setData((d) => ({ ...d, messages: [...(d?.messages || []), temp] }));
    try {
      const r = await call('POST', '/help/messages', { text: t, img: pic || undefined, topic: starting ? topic || undefined : undefined, orderCode: orderCode || undefined });
      setData((d) => ({ ...d, thread: r.thread, messages: [...d.messages.filter((m) => m._id !== temp._id), ...r.messages.map((m) => (m._id === r.messages[0]._id && pic ? { ...m, local: pic } : m))] }));
      setText(''); setPic(''); setTopic(''); setOrderCode('');
      if (window.location.search) window.history.replaceState(null, '', '/help');
    } catch (x) {
      setData((d) => ({ ...d, messages: d.messages.filter((m) => m._id !== temp._id) }));
      setErr(x.message);
    } finally { setSending(false); box.current?.focus(); }
  };

  // Messages with a date line whenever the day changes
  const rows = [];
  let lastDay = '';
  for (const m of msgs) {
    const d = dayOf(m.at);
    if (d !== lastDay) { rows.push(<li key={'d' + m._id} className="hc-day"><span>{d}</span></li>); lastDay = d; }
    if (m.from === 'system') { rows.push(<li key={m._id} className="hc-sys"><span>{m.text}</span></li>); continue; }
    const mine = m.from === 'customer';
    rows.push(
      <li key={m._id} className={`hc-row ${mine ? 'me' : 'them'} ${m.pending ? 'pending' : ''}`}>
        {!mine && <span className="hc-ava" aria-hidden="true"><img src="/brand/matchea-seal-sm.webp" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></span>}
        <div className="hc-bub">
          {!mine && <b className="hc-who">{m.staffName ? `${m.staffName.split(' ')[0]} · Matchéa` : 'Matchéa'}</b>}
          {m.orderNo != null && <span className="hc-ref">Order #{pad(m.orderNo)}</span>}
          {m.img && <ChatImg id={m._id} local={m.local} onOpen={setView} />}
          {m.text && <p>{m.text}</p>}
          <time>{m.pending ? 'Sending…' : timeOf(m.at)}</time>
        </div>
      </li>,
    );
  }

  return (
    <section className="hc">
      <header className="hc-head">
        <button className="hc-back" onClick={() => (window.history.length > 1 ? window.history.back() : go('/account'))} aria-label="Back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="hc-logo" aria-hidden="true"><img src="/brand/matchea-seal-sm.webp" alt="" onError={(e) => { e.currentTarget.parentNode.textContent = 'M'; }} /></span>
        <div className="hc-title">
          <b>{shop?.name || 'Matchéa'} Customer Service</b>
          <small><i className="hc-live" aria-hidden="true" />{thread?.status === 'open' ? 'We’ll reply here' : 'Usually replies in a few minutes'}</small>
        </div>
      </header>

      <ol className="hc-list" ref={list} onScroll={onScroll} aria-live="polite">
        {!data && !err && <li className="hc-sys"><span>Loading…</span></li>}
        {rows}
        {starting && (
          <li className="hc-start">
            <div className="hc-hello">
              <b>Hi {(me?.name || '').split(' ')[0] || 'there'}! How can we help?</b>
              <p>Choose a topic, then tell us what happened. A team member will reply right here.</p>
            </div>
            <div className="hc-topics" role="radiogroup" aria-label="Topic">
              {(data.topics || []).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={topic === t} className={topic === t ? 'on' : ''} onClick={() => { setTopic(topic === t ? '' : t); box.current?.focus(); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">{TOPIC_ICON[t]}</svg><span>{t}</span>
                </button>
              ))}
            </div>
          </li>
        )}
      </ol>

      <form className="hc-compose" onSubmit={send}>
        {(order || orderCode) && (
          <div className="hc-attached">
            <span className="hc-oico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2" /></svg></span>
            <span className="hc-otxt">
              <b>About order {order ? `#${pad(order.no)}` : ''}</b>
              {order && <small>{STATUS[order.status] || order.status} · {peso(order.total)}</small>}
            </span>
            <button type="button" className="hc-x" onClick={() => setOrderCode('')} aria-label="Don’t attach this order">×</button>
          </div>
        )}
        {pic && (
          <div className="hc-attached">
            <img className="hc-thumb" src={pic} alt="To send" />
            <span className="hc-otxt"><b>Photo</b><small>Will be sent with your message</small></span>
            <button type="button" className="hc-x" onClick={() => setPic('')} aria-label="Remove picture">×</button>
          </div>
        )}
        {err && <div className="hc-err" role="alert">{err}</div>}
        <div className="hc-bar">
          <button type="button" className="hc-ico" onClick={() => fileIn.current?.click()} aria-label="Add a photo or screenshot" title="Add a photo or screenshot">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4V7Z" /><circle cx="12" cy="13" r="3.5" /></svg>
          </button>
          <input ref={fileIn} type="file" accept="image/*" hidden onChange={attach} />
          <textarea ref={box} rows={1} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover:hover)').matches) send(e); }}
            placeholder={starting ? (topic ? `Tell us about your ${topic.toLowerCase()} concern…` : 'Type your concern…') : 'Type a message…'} aria-label="Message" />
          <button type="submit" className="hc-send" disabled={(!text.trim() && !pic) || sending} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1Z" /></svg>
          </button>
        </div>
      </form>

      {view && (
        <div className="hc-view" role="dialog" aria-label="Picture" onClick={() => setView('')}>
          <img src={view} alt="Attached" />
          <button className="hc-x big" aria-label="Close">×</button>
        </div>
      )}
    </section>
  );
}

/** "Contact customer service" button used on order pages and the profile */
export function HelpButton({ go, order, unread = 0, className = '' }) {
  return (
    <button type="button" className={`help-btn ${className}`} onClick={() => go(order ? `/help?order=${order}` : '/help')}>
      <span className="help-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Zm-3 5c0 1.5-2 2.5-5 2.5" /></svg>
      </span>
      <span className="help-txt"><b>Contact customer service</b><small>Chat with the Matchéa team</small></span>
      {unread > 0 ? <span className="help-n" aria-label={`${unread} new`}>{unread}</span> : <svg className="help-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>}
    </button>
  );
}
