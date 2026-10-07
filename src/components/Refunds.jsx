// Online tab: paid orders that were cancelled. Staff send the money back from the shop's GCash / GoTyme
// (or in PayMongo), then record the reference and a screenshot here so the customer sees proof.
import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import { peso, pad } from '../lib/format';
import { shrinkImage } from '../lib/shrinkImage';
import Modal from './Modal';
import '../refunds.css';

const LABEL = { gcash: 'GCash', gotyme: 'GoTyme', maya: 'Maya', paymongo: 'PayMongo' };
const fmtNum = (n) => String(n || '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

function copy(text, toast) {
  try { navigator.clipboard.writeText(String(text)).then(() => toast?.('Copied'), () => {}); } catch { /* old browser */ }
}

export default function Refunds({ toast, count = 0, onChange }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [history, setHistory] = useState(false);
  const [proof, setProof] = useState(null);
  const load = useCallback(() => api.get('/online/refunds').then(setData).catch(() => {}), []);
  useEffect(() => { load(); }, [load, count]);
  if (!data || (!data.due.length && !data.sent.length)) return null;

  return (
    <section className={`rf panel ${data.due.length ? 'has-due' : ''}`}>
      <div className="rf-h">
        <span className="rf-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v8m-2.5-2.2c.4.9 1.3 1.4 2.5 1.4 1.5 0 2.5-.7 2.5-1.8 0-2.6-5-1.2-5-3.8 0-1 .9-1.8 2.4-1.8 1.1 0 2 .5 2.4 1.3" /></svg></span>
        <div className="rf-ht">
          <h3>{data.due.length ? `${data.due.length} ${data.due.length === 1 ? 'refund' : 'refunds'} to send` : 'Refunds'}</h3>
          <p className="muted">{data.due.length ? 'Paid orders that were cancelled. Send the full amount back, then record it here.' : 'All refunds are sent.'}</p>
        </div>
        {data.sent.length > 0 && <button className="btn sm ghost" onClick={() => setHistory(!history)}>{history ? 'Hide sent' : `Sent (${data.sent.length})`}</button>}
      </div>
      {data.due.length > 0 && (
        <ul className="rf-list">
          {data.due.map((x) => (
            <li key={x._id} className="rf-row">
              <span className="rf-no num">#{pad(x.no)}</span>
              <span className="rf-who">
                <b>{x.customer}</b>
                <small>{x.fulfil === 'delivery' ? 'Delivery · ' : ''}Paid by {LABEL[x.method] || x.method}{x.paidRef ? ` · ref ${x.paidRef}` : ''}</small>
                {x.cancelReason && <small className="rf-why">Cancelled: {x.cancelReason}</small>}
              </span>
              <b className="rf-amt num">{peso(x.amount)}</b>
              <button className="btn primary sm" onClick={() => setOpen(x)}>Send refund</button>
            </li>
          ))}
        </ul>
      )}
      {history && (
        <ul className="rf-list sent">
          {data.sent.map((x) => (
            <li key={x._id} className="rf-row">
              <span className="rf-no num">#{pad(x.no)}</span>
              <span className="rf-who">
                <b>{x.customer}</b>
                <small>{LABEL[x.refund.method] || x.refund.method}{x.refund.to ? ` to ${fmtNum(x.refund.to)}` : ''}{x.refund.ref ? ` · ref ${x.refund.ref}` : ''} · by {x.refund.by} · {when(x.refund.at)}</small>
              </span>
              <b className="rf-amt num">{peso(x.refund.amount)}</b>
              {x.refund.shot ? <button className="btn ghost sm" onClick={() => setProof(x)}>Proof</button> : <span className="pill ok">Sent</span>}
            </li>
          ))}
        </ul>
      )}
      {open && <SendRefund order={open} toast={toast} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); onChange?.(); toast?.(`Refund for #${pad(open.no)} recorded. The customer was told.`); }} />}
      {proof && <Proof order={proof} onClose={() => setProof(null)} />}
    </section>
  );
}

function SendRefund({ order, toast, onClose, onDone }) {
  const qr = ['gcash', 'gotyme', 'maya'].includes(order.method);
  const app = LABEL[order.method] || order.method;
  const [to, setTo] = useState(fmtNum(order.phone));
  const [ref, setRef] = useState('');
  const [shot, setShot] = useState('');
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const attach = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { setShot(await shrinkImage(f)); setErrs((x) => ({ ...x, shot: '' })); }
    catch (x) { setErrs((y) => ({ ...y, shot: x.message === 'big' ? 'That picture is too big.' : 'Choose a picture file.' })); }
  };
  const save = async () => {
    setBusy(true); setErrs({});
    try { await api.post(`/online/${order._id}/refund`, { to: to.replace(/\s/g, ''), ref, shot: shot || undefined, note }); onDone(); }
    catch (x) { setErrs(x.fields || { form: x.message }); setBusy(false); }
  };
  return (
    <Modal title={`Send refund · #${pad(order.no)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Not yet</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Refund sent'}</button></>}>
      <div className="rf-amount">
        <span>Send back to {order.customer.split(' ')[0]}</span>
        <b className="num">{peso(order.amount)}</b>
        <button type="button" className="btn sm ghost" onClick={() => copy(order.amount.toFixed(2), toast)}>Copy amount</button>
        <small>The full amount{order.fulfil === 'delivery' ? ', delivery fee included' : ''}.</small>
      </div>
      {qr ? (<>
        <ol className="rf-steps">
          <li><b>Open your {app} app</b> and choose Send Money (Express Send).</li>
          <li>
            <b>Send {peso(order.amount)} to this number.</b> It’s the customer’s mobile number on their account. If they asked for another {app} number in the chat, change it here.
            <span className="rf-to">
              <input className="num" inputMode="tel" maxLength={16} value={to} onChange={(e) => setTo(e.target.value)} aria-label={`${app} number to send to`} />
              <button type="button" className="btn sm ghost" onClick={() => copy(to.replace(/\s/g, ''), toast)}>Copy</button>
            </span>
            {errs.to && <em className="rf-err">{errs.to}</em>}
          </li>
          <li>
            <b>Type the reference number</b> from the {app} receipt.
            <input className="num rf-in" inputMode={order.method === 'gcash' ? 'numeric' : 'text'} maxLength={24} value={ref} onChange={(e) => setRef(e.target.value)} placeholder={order.method === 'gcash' ? '13 digits' : 'Reference ID'} aria-label="Reference number" />
            {errs.ref && <em className="rf-err">{errs.ref}</em>}
          </li>
          <li>
            <b>Attach a screenshot</b> of the {app} receipt. The customer sees it on their order page as proof.
            <label className={`rf-shot ${shot ? 'has' : ''}`}>
              <input type="file" accept="image/*" hidden onChange={attach} />
              {shot ? <><img src={shot} alt="Refund receipt" /><span>Change screenshot</span></> : <span>Choose screenshot</span>}
            </label>
            {errs.shot && <em className="rf-err">{errs.shot}</em>}
          </li>
        </ol>
      </>) : (
        <ol className="rf-steps">
          <li><b>Open your PayMongo dashboard</b>, find payment <b className="num">{order.paidRef}</b> and tap Refund for the full amount.</li>
          <li><b>Reference (optional):</b> the refund ID PayMongo shows.<input className="num rf-in" maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Refund reference" />{errs.ref && <em className="rf-err">{errs.ref}</em>}</li>
        </ol>
      )}
      <label className="rf-note">
        <span>Note for the records (optional)</span>
        <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer asked to send to their sister's GCash" />
      </label>
      {errs.form && <div className="banner">{errs.form}</div>}
    </Modal>
  );
}

function Proof({ order, onClose }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true, u = '';
    fetch(`/api/online/${order._id}/refund-shot`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => {});
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [order._id]);
  return (
    <Modal title={`Refund proof · #${pad(order.no)}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="muted" style={{ margin: 0 }}>{peso(order.refund.amount)} by {LABEL[order.refund.method]} to {fmtNum(order.refund.to)} · ref <b>{order.refund.ref}</b> · {order.refund.by}, {when(order.refund.at)}{order.refund.note ? ` · ${order.refund.note}` : ''}</p>
      {url ? <img className="shot-img" src={url} alt="Refund receipt" /> : <p className="muted">Loading…</p>}
    </Modal>
  );
}
