// After pickup: 1-5 stars and an optional comment. Only the shop owner sees it.
import { useState } from 'react';
import { call } from './api';

const WORDS = ['', 'Not good', 'Could be better', 'Okay', 'Good', 'Loved it!'];

export default function RateOrder({ code, rating, onDone }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(rating || null);

  if (done) return (
    <div className="rate done">
      <Stars value={done.stars} />
      <p><b>Thanks for your rating!</b>{done.comment ? <> “{done.comment}”</> : null}</p>
    </div>
  );
  const send = async () => {
    if (!stars) { setErr('Tap a star first.'); return; }
    setBusy(true); setErr('');
    try { const r = await call('POST', `/customer/orders/${code}/rating`, { stars, comment }); setDone(r.rating); onDone?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const shown = hover || stars;
  return (
    <div className="rate">
      <b>How was your order?</b>
      <div className="rate-stars" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => { setStars(n); setErr(''); }}>★</button>
        ))}
        <span className="rate-word">{WORDS[shown]}</span>
      </div>
      {stars > 0 && (
        <>
          <textarea value={comment} maxLength={300} rows={2} placeholder={stars <= 3 ? 'What could we do better? (optional)' : 'Anything you’d like to tell us? (optional)'} onChange={(e) => setComment(e.target.value)} />
          <small className="muted">Only the shop owner sees this.</small>
        </>
      )}
      {err && <p className="rate-err">{err}</p>}
      {stars > 0 && <button className="sh-btn sm" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send rating'}</button>}
    </div>
  );
}

export const Stars = ({ value, small }) => (
  <span className={`stars ${small ? 'sm' : ''}`} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= value ? 'on' : ''}>★</i>)}
  </span>
);
