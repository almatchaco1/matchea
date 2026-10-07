// The shop's own GCash / GoTyme QR codes: set them up (owner) and show them to customers at the counter.
import { useState } from 'react';
import { api } from '../lib/api';
import { peso } from '../lib/format';
import Modal from './Modal';
import { isQrPh, qrPhInfo } from '../shared/qrph.mjs';
import { AmountQr } from '../lib/payqr';

export const QR_LABEL = { gcash: 'GCash', gotyme: 'GoTyme' };
export const qrSrc = (kind, v) => `/api/public/qr/${kind}?v=${v}`;
export const hasQr = (settings, kind) => !!settings?.qr?.[kind]?.v;
const fmtNo = (n) => String(n || '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');

/** Shrink a photo/screenshot so it uploads fast but the QR stays sharp, and read the code inside it. */
async function fileToDataUrl(file) {
  if (!/^image\//.test(file.type)) throw new Error('Choose a picture (PNG or JPG) of your QR code.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That picture is too big. Use a screenshot instead.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/png');
    if (out.length > 1.8e6) out = c.toDataURL('image/jpeg', 0.92); // photos: JPG is much smaller
    let payload = '';
    try { const jsQR = (await import('../lib/vendor/jsqr')).default; const d = g.getImageData(0, 0, c.width, c.height); payload = jsQR(d.data, d.width, d.height)?.data || ''; } catch {}
    return { image: out, payload };
  } finally { URL.revokeObjectURL(url); }
}

/** Owner: upload the GCash and GoTyme QR, and choose how online customers may pay. */
export function QrSettingsModal({ settings, onClose, done, toast }) {
  const [f, setF] = useState(() => Object.fromEntries(['gcash', 'gotyme'].map((k) => [k, { image: null, payload: undefined, read: null, name: settings?.qr?.[k]?.name || '', number: settings?.qr?.[k]?.number || '' }])));
  const [opts, setOpts] = useState({ qrOnline: settings?.qrOnline !== false, payAtPickup: settings?.payAtPickup !== false });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, patch) => { setF((x) => ({ ...x, [k]: { ...x[k], ...patch } })); setErrs((e) => ({ ...e, [k]: null })); };
  const pick = async (k, file) => {
    if (!file) return;
    try {
      const r = await fileToDataUrl(file);
      const payload = isQrPh(r.payload) ? r.payload : '';
      set(k, { image: r.image, payload, read: r.payload ? (payload ? 'ok' : 'other') : 'none', name: f[k].name || (payload ? qrPhInfo(payload).name : '') });
    } catch (e) { setErrs((x) => ({ ...x, [k]: e.message })); }
  };
  const status = (k) => {
    const x = f[k];
    if (x.image === '') return null;
    const read = x.image ? x.read : settings?.qr?.[k]?.v ? (settings.qr[k].payload ? 'ok' : 'none') : null;
    if (!read) return null;
    return read === 'ok'
      ? <div className="qr-ok">✓ The amount fills in by itself for customers{(x.payload || settings?.qr?.[k]?.payload) ? ` · pays ${qrPhInfo(x.payload || settings.qr[k].payload).name}` : ''}</div>
      : <div className="qr-warn">{read === 'other' ? 'This QR isn’t a GCash / GoTyme payment QR.' : 'Couldn’t read the QR in this picture.'} Customers would have to type the amount. Try a clear screenshot of the QR from “Receive”.</div>;
  };
  const preview = (k) => (f[k].image === '' ? null : f[k].image || (settings?.qr?.[k]?.v ? qrSrc(k, settings.qr[k].v) : null));
  const anyQr = ['gcash', 'gotyme'].some((k) => preview(k));

  const save = async () => {
    setBusy(true); setErrs({});
    const e = {};
    for (const k of ['gcash', 'gotyme']) {
      const cur = settings?.qr?.[k] || {};
      if (f[k].image == null && f[k].name === (cur.name || '') && f[k].number === (cur.number || '')) continue;
      try { await api.put(`/settings/qr/${k}`, { image: f[k].image ?? undefined, payload: f[k].image ? f[k].payload || '' : undefined, name: f[k].name, number: f[k].number }); }
      catch (x) { e[k] = x.fields?.number || x.fields?.name || x.fields?.image || x.message; }
    }
    try { await api.put('/settings/qr-options', opts); } catch (x) { e.opts = x.message; }
    setBusy(false);
    if (Object.keys(e).length) { setErrs(e); toast('Some changes were not saved. See the message in red.'); return; }
    done('Payment QR saved');
  };

  return (
    <Modal wide title="GCash & GoTyme QR" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Upload a screenshot of your receive-money QR from the GCash or GoTyme app (without an amount). Customers see it when they order online, with their order total already filled in.</p>
      <div className="qr-set">
        {['gcash', 'gotyme'].map((k) => (
          <div className="qr-card" key={k}>
            <h4>{QR_LABEL[k]}</h4>
            <div className="qr-prev">{preview(k) ? <img src={preview(k)} alt={`${QR_LABEL[k]} QR`} /> : <span>No QR yet</span>}</div>
            <div className="qr-btns">
              <label className="btn sm">{preview(k) ? 'Change picture' : 'Upload QR picture'}<input type="file" accept="image/*" hidden onChange={(e) => { pick(k, e.target.files?.[0]); e.target.value = ''; }} /></label>
              {preview(k) && <button className="btn sm ghost" onClick={() => set(k, { image: '' })}>Remove</button>}
            </div>
            <label className="field"><span>Account name shown to customers</span><input maxLength={60} value={f[k].name} onChange={(e) => set(k, { name: e.target.value })} placeholder="MATCHEA / J. DELA CRUZ" /></label>
            <label className="field"><span>{QR_LABEL[k]} number <small className="muted">(optional)</small></span><input inputMode="tel" maxLength={20} value={f[k].number} onChange={(e) => set(k, { number: e.target.value })} placeholder="0917 123 4567" /></label>
            {status(k)}
            {errs[k] && <div className="ferr" role="alert">{errs[k]}</div>}
          </div>
        ))}
      </div>
      <div className="opt-group" style={{ marginTop: 14 }}>
        <h4>Online orders</h4>
        <label className={`check ${opts.qrOnline ? 'on' : ''}`}><input type="checkbox" checked={opts.qrOnline} onChange={(e) => setOpts({ ...opts, qrOnline: e.target.checked })} disabled={!anyQr} />
          Customers can pay by scanning the QR when they order. They type the reference number, and you accept the order after checking your GCash / GoTyme.</label>
        <label className={`check ${opts.payAtPickup ? 'on' : ''}`}><input type="checkbox" checked={opts.payAtPickup} onChange={(e) => setOpts({ ...opts, payAtPickup: e.target.checked })} />
          Customers can also choose “Pay at pickup”. Untick to accept only orders that are paid first.</label>
        {!opts.payAtPickup && !(opts.qrOnline && anyQr) && <div className="warnbox">With pay at pickup off and no QR, customers can only pay through PayMongo if it’s set up. If it isn’t, pay at pickup stays available.</div>}
        {errs.opts && <div className="ferr">{errs.opts}</div>}
      </div>
    </Modal>
  );
}

/** Big QR for the customer to scan at the counter. */
export function ShowQr({ kind, settings, amount, onClose }) {
  const q = settings?.qr?.[kind];
  if (!q?.v) return null;
  return (
    <div className="qr-show" role="dialog" aria-modal="true" aria-label={`Scan to pay with ${QR_LABEL[kind]}`} onClick={onClose}>
      <div className="qr-show-card" onClick={(e) => e.stopPropagation()}>
        <div className={`qr-brand ${kind}`}>Scan to pay with {QR_LABEL[kind]}</div>
        {amount != null && <div className="qr-amt"><span>Amount</span><b>{peso(amount)}</b></div>}
        <AmountQr kind={kind} q={q} amount={amount} alt={`${QR_LABEL[kind]} QR code`} />
        {(q.name || q.number) && <div className="qr-acct">{q.name}{q.name && q.number ? ' · ' : ''}{fmtNo(q.number)}</div>}
        <p>{q.payload && amount ? 'The amount fills in by itself.' : 'Type the amount shown above.'} After paying, show the cashier your receipt with the reference number.</p>
        <button className="btn primary" onClick={onClose} autoFocus>Done</button>
      </div>
    </div>
  );
}

/** Small "Show QR" row under the GCash / GoTyme choice. */
export function QrHint({ kind, settings, amount, onShow }) {
  if (!['gcash', 'gotyme'].includes(kind)) return null;
  if (!hasQr(settings, kind)) return <p className="muted qr-hint">No {QR_LABEL[kind]} QR uploaded yet. The owner can add it in Menu → GCash & GoTyme QR.</p>;
  return (
    <button type="button" className="qr-hint-btn" onClick={onShow}>
      <img src={qrSrc(kind, settings.qr[kind].v)} alt="" />
      <span><b>Show {QR_LABEL[kind]} QR to customer</b><small>{amount != null ? `${peso(amount)} · ` : ''}then tick “received” below</small></span>
    </button>
  );
}
