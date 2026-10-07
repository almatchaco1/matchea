import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { priceLine } from '../shared/pricing.mjs';
import { ONLINE } from '../shared/rules.mjs';
import { peso, pad, toneFor } from '../lib/format';
import StampCard from './StampCard';
import { CountUp, photoFrom, morphIn, morphOut, useScrollIn } from './fx';
import { TabInk } from '../lib/motion';
import { sceneVar, sceneBg } from '../lib/drinkImages';
import { Doodle, LiveCup } from './art';
import { ShareDrink } from './share';

// Keep the picked category chip in view (centered) on phones
const slideInto = (b) => { const nav = b.parentElement; nav.scrollTo?.({ left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' }); };

const firstName = (n) => (n || '').trim().split(/\s+/)[0] || '';

const STATUS = { awaiting_payment: 'Waiting for payment', new: 'Order received', preparing: 'Preparing', ready: 'Ready for pickup' };

// Category chips get a little picture
const CAT_ICON = {
  All: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'Best sellers': 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z',
  Classic: 'M5 19c8 0 14-6 14-14C11 5 5 11 5 19Zm0 0 9-9',
  Signature: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
};
const CUP_ICON = 'M6 8h12l-1.3 11.2A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.8L6 8Zm-1 0h14M9 8l1-4h4l1 4';
const dayNo = () => Math.floor((Date.now() + 8 * 3600e3) / 864e5); // changes at midnight in Manila

export default function MenuPage({ menu, err, reload, me, active, orders = [], go, onPick, onQuickAdd, onRemoveFav }) {
  const [cat, setCat] = useState('All');
  const [added, setAdded] = useState('');
  const catsRef = useRef(null);
  const gridRef = useRef(null);
  useScrollIn(gridRef, `${cat}|${menu?.items.length || 0}`);
  if (!menu) return <div className="mn mn7">{err ? <div className="shop-alert">{err} <button className="shop-link" onClick={reload}>Try again</button></div> : <MenuSkeleton />}</div>;
  const best = menu.items.filter((i) => i.bestSeller);
  const cats = ['All', ...(best.length ? ['Best sellers'] : []), ...new Set(menu.items.map((i) => i.cat))];
  const shown = menu.items.filter((i) => cat === 'All' || (cat === 'Best sellers' ? i.bestSeller : i.cat === cat))
    .sort((a, b) => (cat === 'All' ? (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0) : 0));
  const first = me.name.split(' ')[0];
  const from = (it) => it.price + (it.hasSizes ? +menu.sizes[0]?.price || 0 : 0);
  const open = menu.shop.open;
  // Drink of the day: one of the best sellers (or any drink), a different one each day
  const pool = (best.length ? best : menu.items).filter((i) => !i.soldOut);
  const spot = pool.length ? pool[dayNo() % pool.length] : null;
  // Order again: the last few different drinks from finished orders, with the same choices
  const again = [];
  for (const o of orders) {
    if (o.status !== 'paid') continue;
    for (const l of o.lines || []) {
      const it = menu.items.find((i) => String(i._id) === String(l.product));
      const key = `${l.product}|${l.mods}`;
      if (it && !again.some((x) => x.key === key)) again.push({ key, it, line: { productId: it._id, sizeId: l.sizeId || menu.sizes[0]?._id || null, addonIds: (l.addonIds || []).filter((a) => it.addons.includes(a)), sweet: it.sweet ? l.sweet || '' : '', note: '' }, mods: l.mods });
    }
    if (again.length >= 6) break;
  }
  const quick = (id, line, el) => { onQuickAdd(line, el); setAdded(id); setTimeout(() => setAdded(''), 1500); };

  return (
    <div className="mn mn7">
      <section className="m7-hero">
        <div className="m7-hello">
          <p className="m7-hi">Hi, {first}</p>
          <h1>What are you <em>craving</em> today?</h1>
          <StampCard compact stamps={me.stamps} go={go} />
          {active[0] && (
            <button className="mn-active" onClick={() => go('/order/' + active[0].code)}>
              <span className="pulse" aria-hidden="true" />
              <span><b>Order #{pad(active[0].no)}</b> · {active[0].fulfil === 'delivery' && active[0].status !== 'new' ? ({ booked: 'Waiting for a rider', picked: 'On the way' }[active[0].riderState] || (active[0].status === 'ready' ? 'Ready · booking a rider' : 'Preparing')) : STATUS[active[0].status]}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
        {spot && (
          <button className="m7-spot" style={{ '--tone': toneFor(spot.name) }} disabled={!open} onClick={(e) => { photoFrom(e.currentTarget.querySelector('img')); onPick(spot); }} aria-label={`Drink of the day: ${spot.name}`}>
            <span className="m7-spot-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={CAT_ICON['Best sellers']} /></svg>Drink of the day</span>
            <span className={`m7-spot-img ${sceneVar(spot.image) ? 'has-scene' : ''}`} style={sceneVar(spot.image)}>{spot.image && <img src={spot.image} alt="" />}</span>
            <span className="m7-spot-t">
              <b>{spot.name}</b>
              {spot.desc && <small>{spot.desc}</small>}
              <span className="m7-spot-p"><span className="num">{peso(from(spot))}</span><i>Order now <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></i></span>
            </span>
          </button>
        )}
        <span className="mn-kanji" lang="ja" aria-hidden="true">お品書き</span>
      </section>

      {!open && <div className="closed-note"><Doodle kind="closed" size={90} /><div><b>We’re closed right now</b><p>{menu.shop.message || 'Online ordering is closed right now. Please order at the counter.'}</p></div></div>}

      {again.length > 0 && (
        <section className="m7-row">
          <div className="m7-row-h"><h2>Order again</h2><small>Your last drinks, same choices</small></div>
          <div className="m7-scroll">
            {again.map(({ key, it, line, mods }) => {
              const x = priceLine({ ...line, qty: 1 }, { ...it, milkQty: 0 }, { sizes: menu.sizes, milks: [], addons: menu.addons });
              const off = it.soldOut || !open;
              return (
                <div key={key} className="m7-mini">
                  {it.image && <img src={it.image} alt="" className={sceneBg(it.image) ? 'scene-bg' : undefined} style={sceneBg(it.image)} />}
                  <div className="m7-mini-b"><b>{it.name}</b><small>{mods || 'Regular'}</small><span className="num">{peso(x.total)}</span></div>
                  <button className="m7-mini-add" disabled={off} aria-label={`Add ${it.name} again`} onClick={(e) => quick(key, { ...line, sizeId: x.sizeId, addonIds: x.addonIds }, e.currentTarget.closest('.m7-mini')?.querySelector('img'))}>
                    {added === key ? '✓' : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {me.favorites?.length > 0 && (
        <section className="fav m7-row">
          <div className="m7-row-h"><h2>Your favourites</h2><small>Saved with your choices</small></div>
          <div className="fav-row">
            {me.favorites.map((f) => {
              const it = menu.items.find((i) => i._id === f.productId);
              if (!it) return (
                <div key={f._id} className="fav-card gone"><div className="fav-b"><b>{f.label}</b><small>No longer on the menu</small></div>
                  <button className="fav-x" onClick={() => onRemoveFav(f._id)} aria-label={`Remove ${f.label}`}>×</button></div>
              );
              const x = priceLine({ ...f, qty: 1 }, { ...it, milkQty: 0 }, { sizes: menu.sizes, milks: [], addons: menu.addons });
              const off = it.soldOut || !open;
              return (
                <div key={f._id} className="fav-card">
                  {it.image && <img src={it.image} alt="" className={sceneBg(it.image) ? 'scene-bg' : undefined} style={sceneBg(it.image)} />}
                  <div className="fav-b">
                    <b>{f.label || it.name}</b>
                    <small>{x.mods || 'Regular'}</small>
                    <span className="mn-price">{peso(x.total)}</span>
                  </div>
                  <button className="sh-btn sm" disabled={off} onClick={(e) => quick(f._id, { productId: f.productId, sizeId: x.sizeId, addonIds: x.addonIds, sweet: f.sweet, note: f.note || '' }, e.currentTarget.closest('.fav-card')?.querySelector('img'))}>
                    {it.soldOut ? (it.notAvailable ? 'Not available' : 'Sold out') : added === f._id ? 'Added ✓' : 'Add'}
                  </button>
                  <button className="fav-x" onClick={() => onRemoveFav(f._id)} aria-label={`Remove ${f.label || it.name} from favourites`}>×</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="m7-catbar">
        <nav className="mn-cats m7-cats" aria-label="Categories" ref={catsRef}>
          <TabInk nav={catsRef} dep={`${cat}|${cats.length}`} sel={'[aria-pressed="true"]'} className="cat-ink" />
          {cats.map((c) => (
            <button key={c} aria-pressed={c === cat} onClick={(e) => { setCat(c); slideInto(e.currentTarget); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CAT_ICON[c] || CUP_ICON} /></svg>
              {c} <small>{c === 'All' ? menu.items.length : c === 'Best sellers' ? best.length : menu.items.filter((i) => i.cat === c).length}</small>
            </button>
          ))}
        </nav>
      </div>

      <div className="mn-grid m7-grid" key={cat} ref={gridRef}>
        {shown.map((it, i) => (
          <article key={it._id} className={`mn-card m7-card ${it.soldOut ? 'out' : ''}`} style={{ '--i': Math.min(i, 10), '--tone': toneFor(it.name) }}>
            <button className={`mn-photo ${sceneVar(it.image) ? 'has-scene' : ''}`} style={sceneVar(it.image)} disabled={it.soldOut || !open} onClick={(e) => { photoFrom(e.currentTarget.querySelector('img')); onPick(it); }} aria-label={`Choose ${it.name}`}>
              {it.image && <img src={it.image} alt="" loading="lazy" />}
              {it.soldOut ? <span className="mn-tag">{it.notAvailable ? 'Not available' : 'Sold out'}</span> : it.bestSeller && <span className="mn-best hanko"><b lang="ja">人気</b>Best seller</span>}
            </button>
            <div className="mn-body">
              <span className="m7-cat">{it.cat}</span>
              <h3>{it.name}</h3>
              {it.desc && <p>{it.desc}</p>}
              <div className="mn-foot">
                <span className="mn-price">{it.hasSizes && menu.sizes.length > 1 && <small>from </small>}{peso(from(it))}</span>
                <button className="mn-add m7-add" disabled={it.soldOut || !open} onClick={(e) => { photoFrom(e.currentTarget.closest('.mn-card')?.querySelector('.mn-photo img')); onPick(it); }} aria-label={`Add ${it.name}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Add</span>
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ItemSheet({ item, menu, initial, onClose, onSave, onFavorite, who }) {
  const [fav, setFav] = useState('');
  const [sharing, setSharing] = useState(null);
  const addons = menu.addons.filter((a) => item.addons.includes(a._id));
  const [L, setL] = useState(() => initial ? { ...initial, addonIds: (initial.addonIds || []).filter((id) => addons.some((a) => a._id === id)) } : {
    productId: item._id, sizeId: menu.sizes[0]?._id || null,
    sweet: item.sweet ? menu.sweetness[Math.min(2, menu.sweetness.length - 1)] || '' : '', addonIds: [], qty: 1, note: '',
  });
  const x = priceLine(L, { ...item, milkQty: 0 }, { sizes: menu.sizes, milks: [], addons: menu.addons });
  const set = (p) => setL({ ...L, ...p });
  const sizeAt = Math.max(0, menu.sizes.findIndex((s) => s._id === x.sizeId));
  const picked = addons.filter((a) => L.addonIds.includes(a._id));
  const hero = useRef(null);
  useLayoutEffect(() => { morphIn(hero.current); }, []); // the menu photo grows into this sheet
  const close = () => { morphOut(hero.current); onClose(); }; // …and shrinks back when it closes
  useEffect(() => { if (sharing) return undefined; const k = (e) => e.key === 'Escape' && close(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose, sharing]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareCard = () => setSharing({ item, who: firstName(who), shop: menu.shop,
    size: item.hasSizes && menu.sizes.length > 1 ? { label: menu.sizes[sizeAt]?.label, big: sizeAt > 0 } : null,
    sweet: item.sweet && L.sweet ? `${L.sweet} sweet` : '', addons: picked.map((a) => a.label) });
  const sweetPct = (v) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50; };
  const sweetWord = (v) => { const n = sweetPct(v); return n === 0 ? 'No sugar' : n <= 25 ? 'Barely sweet' : n <= 50 ? 'Just right' : n <= 75 ? 'Sweet' : 'Extra sweet'; };
  return (<>
    <div className="shop-scrim" onMouseDown={(e) => !sharing && e.target === e.currentTarget && close()}>
      <div className="sheet sheet7" role="dialog" aria-modal="true" aria-label={item.name}>
        <button className="sheet-x" onClick={close} aria-label="Close">×</button>
        <div className={`sheet-hero size-${sizeAt} ${sceneVar(item.image) ? 'has-scene' : ''}`} style={sceneVar(item.image)}>
          {item.image && <img ref={hero} src={item.image} alt="" />}
          {item.hasSizes && menu.sizes.length > 1 && <span className="sh-size" key={x.sizeId}>{menu.sizes[sizeAt]?.label}</span>}
          <span className="sh-tags">{picked.map((a) => <i key={a._id}>+ {a.label}</i>)}</span>
          <LiveCup name={item.name} sweet={item.sweet ? L.sweet : null} sizeAt={item.hasSizes ? sizeAt : 0} sizes={item.hasSizes ? menu.sizes.length : 1} addons={picked} />
        </div>
        <div className="sheet-b">
          <div className="s7-title">
            <div>
              {item.cat && <span className="m7-cat">{item.cat}</span>}
              <h2>{item.name}</h2>
            </div>
            <div className="s7-icons">
              {onFavorite && (
                <button className={`s7-ico ${fav === 'saved' ? 'on' : ''}`} disabled={fav === 'saving' || fav === 'saved'} aria-label={fav === 'saved' ? 'Saved to your favourites' : 'Save these choices as a favourite'} title={fav === 'saved' ? 'Saved' : 'Save as favourite'}
                  onClick={async () => { setFav('saving'); try { await onFavorite({ ...L, sizeId: x.sizeId, addonIds: x.addonIds, note: L.note.trim() }); setFav('saved'); } catch (e) { setFav(e.message); } }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
                </button>
              )}
              <button className="s7-ico" onClick={shareCard} aria-label="Share my drink" title="Share my drink">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
              </button>
            </div>
          </div>
          {item.desc && <p className="sheet-desc">{item.desc}</p>}
          {fav === 'saved' && <p className="s7-saved">♥ Saved to your favourites</p>}
          {fav && !['saved', 'saving'].includes(fav) && <p className="fav-err">{fav}</p>}

          {item.hasSizes && menu.sizes.length > 1 && (
            <div className="grp s7-grp">
              <h4>Size</h4>
              <div className="s7-sizes" role="radiogroup" aria-label="Size">
                {menu.sizes.map((sz, k) => {
                  const on = x.sizeId === sz._id;
                  return (
                    <button key={sz._id} role="radio" aria-checked={on} className={`s7-size ${on ? 'on' : ''}`} onClick={() => set({ sizeId: sz._id })}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22 + k * 7, height: 22 + k * 7 }}><path d={CUP_ICON} /></svg>
                      <b>{sz.label}</b>
                      <small>{+sz.price ? `+${peso(sz.price)}` : 'Included'}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {item.sweet && (
            <div className="grp s7-grp">
              <h4>Sweetness <i>{sweetWord(L.sweet)}</i></h4>
              <div className="s7-sweet" role="radiogroup" aria-label="Sweetness">
                {menu.sweetness.map((sw) => {
                  const on = L.sweet === sw;
                  return (
                    <button key={sw} role="radio" aria-checked={on} className={`s7-sw ${on ? 'on' : ''}`} onClick={() => set({ sweet: sw })} style={{ '--fill': `${sweetPct(sw)}%` }}>
                      <span className="s7-sw-cup" aria-hidden="true"><i /></span>
                      <b>{sw}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {addons.length > 0 && (
            <div className="grp s7-grp">
              <h4>Add-ons <i>Optional</i></h4>
              <div className="s7-addons">
                {addons.map((a) => {
                  const on = L.addonIds.includes(a._id);
                  return (
                    <button key={a._id} aria-pressed={on} className={`s7-addon ${on ? 'on' : ''}`} onClick={() => set({ addonIds: on ? L.addonIds.filter((i) => i !== a._id) : [...L.addonIds, a._id] })}>
                      <span className="s7-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
                      <b>{a.label}</b>
                      <small>+{peso(a.price)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="sheet-f">
          <div className="qty" aria-label="Quantity">
            <button onClick={() => set({ qty: Math.max(1, L.qty - 1) })} disabled={L.qty <= 1} aria-label="Fewer">−</button>
            <span>{L.qty}</span>
            <button onClick={() => set({ qty: Math.min(ONLINE.lineQty, L.qty + 1) })} disabled={L.qty >= ONLINE.lineQty} aria-label="More">+</button>
          </div>
          <button className="sh-btn big" disabled={item.soldOut} onClick={() => onSave({ ...L, note: L.note.trim() })}>{item.soldOut ? (item.notAvailable ? 'Not available right now' : 'Sold out right now') : <>{initial ? 'Update' : 'Add to cart'} · <CountUp value={x.total} format={peso} duration={350} /></>}</button>
        </div>
      </div>
    </div>
    {sharing && <ShareDrink card={sharing} onClose={() => setSharing(null)} />}
  </>);
}

// Grey placeholder cards while the menu loads
export function MenuSkeleton({ n = 8 }) {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <div className="skel skel-line" style={{ width: 90, height: 22, marginBottom: 10 }} />
      <div className="skel skel-line" style={{ width: 280, height: 32, marginBottom: 22 }} />
      <div className="skel-chips">{[64, 110, 96, 84].map((w, i) => <div key={i} className="skel" style={{ width: w }} />)}</div>
      <div className="mn-grid">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="mn-card skel-card">
            <div className="skel" style={{ aspectRatio: '1 / 1' }} />
            <div className="mn-body"><div className="skel skel-line" style={{ width: '75%' }} /><div className="skel skel-line" style={{ width: '55%' }} /><div className="skel skel-line" style={{ width: '35%', marginTop: 14 }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
