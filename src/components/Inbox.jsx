// POS "Messages" tab: customer service chats from the website. Any staff member can reply.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { peso, pad } from '../lib/format';
import { shrinkImage } from '../lib/shrinkImage';
import { ago } from './Staff';
import '../inbox.css';

const QUICK = [
  'Hi! Thanks for messaging us. Let me check this for you.',
  'We found your payment. Your order is now being made.',
  'Could you send a screenshot of your receipt, please?',
  'Sorry about that! We’ll make it right.',
  'Your order is ready for pickup.',
];
const STATUS = { awaiting_payment: 'Waiting for payment', new: 'New', preparing: 'Preparing', ready: 'Ready', paid: 'Done', cancelled: 'Cancelled', void: 'Cancelled' };
const METHOD = { gcash: 'GCash', maya: 'Maya', cash: 'Cash', card: 'Card' };
const timeOf = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const dayOf = (d) => {
  const f = (x) => new Date(x).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  if (f(d) === f(Date.now())) return 'Today';
  if (f(d) === f(Date.now() - 864e5)) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Img({ id, local, onOpen }) {
  const [url, setUrl] = useState(local || '');
  useEffect(() => {
    if (local) return undefined;
    let live = true, u = '';
    fetch(`/api/support/img/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch(() => {});
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id, local]);
  return url ? <button type="button" className="ib-img" onClick={() => onOpen(url)}><img src={url} alt="Sent by the customer" /></button> : <span className="ib-img loading" />;
}

export default function Inbox({ toast, onCount }) {
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [conv, setConv] = useState(null); // { thread, messages, orders }
  const [text, setText] = useState('');
  const [pic, setPic] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState('');
  const box = useRef(null);
  const scroller = useRef(null);
  const fileIn = useRef(null);
  const atBottom = useRef(true);

  const loadList = useCallback(() => api.get('/support').then((d) => { setList(d); setErr(''); }).catch((e) => setErr(e.message)), []);
  const loadConv = useCallback((id) => api.get(`/support/${id}`)
    .then((d) => { setConv((prev) => (prev && prev.thread._id === d.thread._id && prev.messages.length === d.messages.length && prev.thread.status === d.thread.status ? prev : d)); onCount?.(); })
    .catch((e) => { setErr(e.message); }), [onCount]);

  useEffect(() => { loadList(); const t = setInterval(loadList, 5000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => {
    if (!sel) return undefined;
    atBottom.current = true; setConv(null); setText(''); setPic('');
    // Phones: the conversation fills the screen
    if (window.matchMedia('(max-width:900px)').matches) setTimeout(() => { const el = document.querySelector('.ib'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' }); }, 60);
    loadConv(sel);
    const t = setInterval(() => loadConv(sel), 4000);
    return () => clearInterval(t);
  }, [sel, loadConv]);
  useLayoutEffect(() => { const el = scroller.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [conv?.messages?.length]);
  useLayoutEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; } }, [text]);

  const threads = useMemo(() => {
    const all = list?.threads || [];
    const s = q.trim().toLowerCase();
    return all.filter((t) => (filter === 'all' || t.status === filter) && (!s || t.name.toLowerCase().includes(s) || t.phone.includes(s.replace(/\D/g, '') || '~')));
  }, [list, filter, q]);
  const active = conv?.thread;

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if ((!t && !pic) || sending || !active) return;
    setSending(true); setErr('');
    try {
      const r = await api.post(`/support/${active._id}/reply`, { text: t, img: pic || undefined });
      atBottom.current = true;
      setConv((c) => ({ ...c, thread: r.thread, messages: [...c.messages, pic ? { ...r.message, local: pic } : r.message] }));
      setText(''); setPic(''); loadList();
    } catch (x) { setErr(x.message); } finally { setSending(false); box.current?.focus(); }
  };
  const resolve = async () => {
    try { const r = await api.post(`/support/${active._id}/resolve`); setConv((c) => ({ ...c, thread: r.thread })); loadConv(active._id); loadList(); toast?.('Marked as solved'); }
    catch (x) { setErr(x.message); }
  };
  const attach = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { setPic(await shrinkImage(f)); } catch (x) { setErr(x.message === 'big' ? 'That picture is too big.' : 'Choose a picture file.'); }
  };

  // Conversation rows with a date line when the day changes
  const rows = [];
  let lastDay = '';
  for (const m of conv?.messages || []) {
    const d = dayOf(m.at);
    if (d !== lastDay) { rows.push(<li key={'d' + m._id} className="ib-day"><span>{d}</span></li>); lastDay = d; }
    if (m.from === 'system') { rows.push(<li key={m._id} className="ib-sys"><span>{m.text}</span></li>); continue; }
    const staff = m.from === 'staff';
    rows.push(
      <li key={m._id} className={`ib-row ${staff ? 'us' : 'them'}`}>
        <div className="ib-bub">
          {staff && <b className="ib-who">{m.staffName}</b>}
          {m.orderNo != null && <span className="ib-ref">Order #{pad(m.orderNo)}</span>}
          {m.img && <Img id={m._id} local={m.local} onOpen={setView} />}
          {m.text && <p>{m.text}</p>}
          <time>{timeOf(m.at)}</time>
        </div>
      </li>,
    );
  }

  return (
    <div className={`ib ${sel ? 'has-sel' : ''}`}>
      <aside className="ib-side">
        <div className="ib-side-h">
          <div>
            <h2>Messages</h2>
            <p className="muted">{list ? `${list.unread} unread · ${list.open} open` : 'Loading…'}</p>
          </div>
        </div>
        <div className="ib-tools">
          <input type="search" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
          <div className="ib-seg" role="tablist">
            {[['open', 'Open'], ['resolved', 'Solved'], ['all', 'All']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <ul className="ib-threads">
          {list && threads.length === 0 && (
            <li className="ib-none">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0-8-4.9L3 21l4.9-1A9 9 0 0 0 12 21Z" /></svg>
              <b>{filter === 'open' ? 'All caught up' : 'No conversations'}</b>
              <small>Customers can chat with you from the website: “Contact customer service”.</small>
            </li>
          )}
          {threads.map((t) => (
            <li key={t._id}>
              <button className={`ib-th ${sel === t._id ? 'on' : ''} ${t.unreadStaff ? 'unread' : ''}`} onClick={() => setSel(t._id)}>
                <span className="ib-ava" aria-hidden="true">{initials(t.name)}</span>
                <span className="ib-th-m">
                  <span className="ib-th-top"><b>{t.name}</b><time>{ago(t.lastAt)}</time></span>
                  <span className="ib-th-tags">
                    {t.status === 'resolved' && <i className="tag ok">Solved</i>}
                    {t.topic && <i className="tag">{t.topic}</i>}
                    {t.orderNo != null && <i className="tag">#{pad(t.orderNo)}</i>}
                  </span>
                  <span className="ib-th-last">{t.lastFrom === 'staff' ? 'You: ' : ''}{t.lastText}</span>
                </span>
                {t.unreadStaff > 0 && <span className="ib-n">{t.unreadStaff}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="ib-main">
        {!sel ? (
          <div className="ib-empty">
            <div className="ib-empty-art" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Zm-3 5c0 1.5-2 2.5-5 2.5" /></svg>
            </div>
            <b>Customer service</b>
            <p className="muted">Pick a conversation to read and reply. New messages show a number on the Messages tab.</p>
          </div>
        ) : !conv ? <div className="ib-empty"><p className="muted">Loading…</p></div> : (<>
          <header className="ib-head">
            <button className="ib-back btn sm ghost" onClick={() => setSel(null)} aria-label="Back to the list">‹</button>
            <span className="ib-ava big" aria-hidden="true">{initials(active.name)}</span>
            <div className="ib-head-m">
              <b>{active.name}</b>
              <small>{active.phone ? <a href={`tel:${active.phone}`}>{active.phone}</a> : 'No mobile number'}{active.topic && <> · {active.topic}</>}</small>
            </div>
            {active.status === 'open'
              ? <button className="btn sm ib-solve" onClick={resolve}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7" /></svg>Mark as solved</button>
              : <span className="tag ok">Solved</span>}
          </header>
          {conv.orders?.length > 0 && (
            <div className="ib-orders" aria-label="Recent online orders">
              {conv.orders.map((o) => (
                <span key={o.code || o.no + o.at} className={`ib-o s-${o.status} ${active.orderCode && o.code === active.orderCode ? 'about' : ''}`} title={o.cancelReason || undefined}>
                  <b>#{pad(o.no)}</b>
                  <small>{STATUS[o.status] || o.status} · {peso(o.total)}{o.method ? ` · ${METHOD[o.method] || o.method}` : ''}</small>
                  <small className="ib-o-d">{dayOf(o.at)} {timeOf(o.at)}</small>
                </span>
              ))}
            </div>
          )}
          <ol className="ib-msgs" ref={scroller} onScroll={() => { const el = scroller.current; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>{rows}</ol>
          <form className="ib-compose" onSubmit={send}>
            <div className="ib-quick">
              {QUICK.map((qq) => <button key={qq} type="button" onClick={() => { setText(qq); box.current?.focus(); }}>{qq}</button>)}
            </div>
            {pic && <div className="ib-pic"><img src={pic} alt="To send" /><span>Photo will be sent</span><button type="button" className="btn sm ghost" onClick={() => setPic('')}>Remove</button></div>}
            {err && <div className="banner">{err}</div>}
            <div className="ib-bar">
              <button type="button" className="ib-ico" onClick={() => fileIn.current?.click()} aria-label="Attach a picture" title="Attach a picture">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4V7Z" /><circle cx="12" cy="13" r="3.5" /></svg>
              </button>
              <input ref={fileIn} type="file" accept="image/*" hidden onChange={attach} />
              <textarea ref={box} rows={1} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }}
                placeholder={`Reply to ${active.name.split(' ')[0]}…  (Enter to send, Shift+Enter for a new line)`} />
              <button type="submit" className="btn primary ib-send" disabled={(!text.trim() && !pic) || sending}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1Z" /></svg>{sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </>)}
      </section>

      {view && (
        <div className="ib-view" role="dialog" aria-label="Picture" onClick={() => setView('')}>
          <img src={view} alt="Sent by the customer" />
        </div>
      )}
    </div>
  );
}
