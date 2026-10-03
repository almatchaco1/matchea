import { useEffect, useState } from 'react';
import { STAMPS_PER_REWARD, rewardsReady, stampProgress } from '../shared/loyalty.mjs';

// Buy 9, get the 10th free
export default function StampCard({ stamps = 0, compact, go }) {
  const ready = rewardsReady(stamps);
  const extra = stampProgress(stamps);
  const have = ready > 0 ? STAMPS_PER_REWARD : extra; // a full card while a free drink is waiting
  if (compact) {
    return (
      <button className={`stamp-pill ${ready ? 'ready' : ''}`} onClick={() => go?.('/account')}>
        <span className="stamp-mini" aria-hidden="true">{Array.from({ length: STAMPS_PER_REWARD }, (_, i) => <i key={i} className={i < have ? 'on' : ''} />)}</span>
        <span>{ready ? <b>{ready === 1 ? 'Free drink ready!' : `${ready} free drinks ready!`}</b> : <><b>{have}/{STAMPS_PER_REWARD}</b> stamps</>}</span>
      </button>
    );
  }
  return <PaperCard stamps={stamps} ready={ready} extra={extra} have={have} />;
}

function PaperCard({ ready, extra, have }) {
  const [flipped, setFlipped] = useState(false);
  // A new free drink: turn the card over to show it (once per visit)
  useEffect(() => {
    if (!ready) { setFlipped(false); return undefined; }
    let seen = false;
    try { seen = sessionStorage.getItem('alm.freeSeen') === String(ready); sessionStorage.setItem('alm.freeSeen', String(ready)); } catch {}
    if (seen) return undefined;
    const t = setTimeout(() => setFlipped(true), 1100);
    return () => clearTimeout(t);
  }, [ready]);
  const label = `Stamp card: ${have} of ${STAMPS_PER_REWARD} stamps${ready ? `, ${ready} free drink ready` : ''}`;
  return (
    <section className={`stampcard paper ${flipped ? 'flipped' : ''} ${ready ? 'has-free' : ''}`} aria-label={label}>
      <div className="sc-inner">
        <div className="sc-face sc-front" aria-hidden={flipped}>
          <div className="stampcard-h">
            <div><p className="sc-kicker">Matchéa · Loyalty card</p><h2>Stamp card</h2><p>Buy {STAMPS_PER_REWARD} drinks, get the 10th free.</p></div>
            {ready > 0 && <button type="button" className="stamp-ready" onClick={() => setFlipped(true)}>{ready === 1 ? '1 free drink ready' : `${ready} free drinks ready`} ↻</button>}
          </div>
          <ol className="stamps">
            {Array.from({ length: STAMPS_PER_REWARD }, (_, i) => (
              <li key={i} className={i < have ? 'on' : ''} style={{ '--i': i, '--r': `${((i * 37) % 22) - 11}deg` }}><span aria-hidden="true">{i < have ? <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 21c-5-1-8-5.5-8-11 4.8.8 7.6 4.6 8 11Z" fill="currentColor" /><path d="M12 21c.3-6.6 4.2-11 10-12.4.2 6.6-4 11.3-10 12.4Z" fill="currentColor" /></svg> : i + 1}</span></li>
            ))}
            <li className={`free ${ready ? 'on' : ''}`}><span>FREE</span></li>
          </ol>
          <p className="stamp-foot">
            {ready > 0 ? `Use it at checkout, or tell the cashier your number.${extra ? ` You also have ${extra} ${extra === 1 ? 'stamp' : 'stamps'} toward the next one.` : ''}` : `${STAMPS_PER_REWARD - have} more ${STAMPS_PER_REWARD - have === 1 ? 'drink' : 'drinks'} to your free drink.`}
            {' '}Stamps are added when you pick up your order. At the counter, just give your mobile number.
          </p>
        </div>
        {ready > 0 && (
          <div className="sc-face sc-back" aria-hidden={!flipped}>
            <div className="sc-free-stamp"><small>Good for one</small><b>FREE</b><small>drink</small></div>
            <div className="sc-back-t">
              <h2>{ready === 1 ? 'Your free drink is ready!' : `${ready} free drinks are ready!`}</h2>
              <p>Pick any drink. Tick “Use my free drink” at checkout, or give your number at the counter.</p>
              <button type="button" className="sh-btn light sm" onClick={() => setFlipped(false)}>See my stamps ↻</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
