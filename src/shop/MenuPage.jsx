import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { priceLine } from '../shared/pricing.mjs';
import { ONLINE } from '../shared/rules.mjs';
import { peso, pad } from '../lib/format';
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

export default function MenuPage({ menu, err, reload, me, active, go, onPick, onQuickAdd, onRemoveFav }) {
  const [cat, setCat] = useState('All');
  const [added, setAdded] = useState('');
  const catsRef = useRef(null);
  const gridRef = useRef(null);
  useScrollIn(gridRef, `${cat}|${menu?.items.length || 0}`);
  if (!menu) return <div className="mn">{err ? <div className="shop-alert">{err} <button className="shop-link" onClick={reload}>Try again</button></div> : <MenuSkeleton />}</div>;
  const best = menu.items.filter((i) => i.bestSeller);
  const cats = ['All', ...(best.length ? ['Best sellers'] : []), ...new Set(menu.items.map((i) => i.cat))];
  const shown = menu.items.filter((i) => cat === 'All' || (cat === 'Best sellers' ? i.bestSeller : i.cat === cat))
    .sort((a, b) => (cat === 'All' ? (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0) : 0));
  const first = me.name.split(' ')[0];
  const from = (it) => it.price + (it.hasSizes ? +menu.sizes[0]?.price || 0 : 0);

  return (
    <div className="mn">
      <div className="mn-top">
        <span className="mn-kanji" lang="ja" aria-hidden="true">お品書き</span>
        <div>
          <p className="mn-hi">Hi, {first}</p>
          <h1>What are you craving?</h1>
          <StampCard compact stamps={me.stamps} go={go} />
        </div>
        {active[0] && (
          <button className="mn-active" onClick={() => go('/order/' + active[0].code)}>
            <span className="pulse" aria-hidden="true" />
            <span><b>Order #{pad(active[0].no)}</b> · {STATUS[active[0].status]}</span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
      {!menu.shop.open && <div className="closed-note"><Doodle kind="closed" size={90} /><div><b>We’re closed right now</b><p>{menu.shop.message || 'Online ordering is closed right now. Please order at the counter.'}</p></div></div>}
      {me.favorites?.length > 0 && (
        <section className="fav">
          <h2>Your favourites</h2>
          <div className="fav-row">
            {me.favorites.map((f) => {
              const it = menu.items.find((i) => i._id === f.productId);
              if (!it) return (
                <div key={f._id} className="fav-card gone"><div className="fav-b"><b>{f.label}</b><small>No longer on the menu</small></div>
                  <button className="fav-x" onClick={() => onRemoveFav(f._id)} aria-label={`Remove ${f.label}`}>×</button></div>
              );
              const x = priceLine({ ...f, qty: 1 }, { ...it, milkQty: 0 }, { sizes: menu.sizes, milks: [], addons: menu.addons });
              const off = it.soldOut || !menu.shop.open;
              return (
                <div key={f._id} className="fav-card">
                  {it.image && <img src={it.image} alt="" className={sceneBg(it.image) ? 'scene-bg' : undefined} style={sceneBg(it.image)} />}
                  <div className="fav-b">
                    <b>{f.label || it.name}</b>
                    <small>{x.mods || 'Regular'}</small>
                    <span className="mn-price">{peso(x.total)}</span>
                  </div>
                  <button className="sh-btn sm" disabled={off} onClick={(e) => { onQuickAdd({ productId: f.productId, sizeId: x.sizeId, addonIds: x.addonIds, sweet: f.sweet, note: f.note || '' }, e.currentTarget.closest('.fav-card')?.querySelector('img')); setAdded(f._id); setTimeout(() => setAdded(''), 1500); }}>
                    {it.soldOut ? (it.notAvailable ? 'Not available' : 'Sold out') : added === f._id ? 'Added ✓' : 'Add'}
                  </button>
                  <button className="fav-x" onClick={() => onRemoveFav(f._id)} aria-label={`Remove ${f.label || it.name} from favourites`}>×</button>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <nav className="mn-cats" aria-label="Categories" ref={catsRef}>
        <TabInk nav={catsRef} dep={`${cat}|${cats.length}`} sel={'[aria-pressed="true"]'} className="cat-ink" />
        {cats.map((c) => <button key={c} aria-pressed={c === cat} onClick={(e) => { setCat(c); slideInto(e.currentTarget); }}>{c} <small>{c === 'All' ? menu.items.length : c === 'Best sellers' ? best.length : menu.items.filter((i) => i.cat === c).length}</small></button>)}
      </nav>
      <div className="mn-grid" key={cat} ref={gridRef}>
        {shown.map((it, i) => (
          <article key={it._id} className={`mn-card ${it.soldOut ? 'out' : ''}`} style={{ '--i': Math.min(i, 10) }}>
            <button className={`mn-photo ${sceneVar(it.image) ? 'has-scene' : ''}`} style={sceneVar(it.image)} disabled={it.soldOut || !menu.shop.open} onClick={(e) => { photoFrom(e.currentTarget.querySelector('img')); onPick(it); }} aria-label={`Choose ${it.name}`}>
              {it.image && <img src={it.image} alt="" loading="lazy" />}
              {it.soldOut ? <span className="mn-tag">{it.notAvailable ? 'Not available' : 'Sold out'}</span> : it.bestSeller && <span className="mn-best hanko"><b lang="ja">人気</b>Best seller</span>}
            </button>
            <div className="mn-body">
              <h3>{it.name}</h3>
              {it.desc && <p>{it.desc}</p>}
              <div className="mn-foot">
                <span className="mn-price">{peso(from(it))}</span>
                <button className="mn-add" disabled={it.soldOut || !menu.shop.open} onClick={(e) => { photoFrom(e.currentTarget.closest('.mn-card')?.querySelector('.mn-photo img')); onPick(it); }} aria-label={`Add ${it.name}`}>+</button>
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
  return (<>
    <div className="shop-scrim" onMouseDown={(e) => !sharing && e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={item.name}>
        <button className="sheet-x" onClick={close} aria-label="Close">×</button>
        <div className={`sheet-hero size-${sizeAt} ${sceneVar(item.image) ? 'has-scene' : ''}`} style={sceneVar(item.image)}>
          {item.image && <img ref={hero} src={item.image} alt="" />}
          {item.hasSizes && menu.sizes.length > 1 && <span className="sh-size" key={x.sizeId}>{menu.sizes[sizeAt]?.label}</span>}
          <span className="sh-tags">{picked.map((a) => <i key={a._id}>+ {a.label}</i>)}</span>
          <LiveCup name={item.name} sweet={item.sweet ? L.sweet : null} sizeAt={item.hasSizes ? sizeAt : 0} sizes={item.hasSizes ? menu.sizes.length : 1} addons={picked} />
        </div>
        <div className="sheet-b">
          <h2>{item.name}</h2>
          {item.desc && <p className="sheet-desc">{item.desc}</p>}
          {onFavorite && (
            <button className={`fav-save ${fav === 'saved' ? 'on' : ''}`} disabled={fav === 'saving' || fav === 'saved'}
              onClick={async () => { setFav('saving'); try { await onFavorite({ ...L, sizeId: x.sizeId, addonIds: x.addonIds, note: L.note.trim() }); setFav('saved'); } catch (e) { setFav(e.message); } }}>
              {fav === 'saved' ? '♥ Saved to your favourites' : fav === 'saving' ? 'Saving…' : '♡ Save these choices as a favourite'}
            </button>
          )}
          {fav && !['saved', 'saving'].includes(fav) && <p className="fav-err">{fav}</p>}
          <button className="fav-save share-open" onClick={shareCard}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Share my drink
          </button>
          {item.hasSizes && menu.sizes.length > 1 && <Group title="Size">
            {menu.sizes.map((s) => <Choice key={s._id} on={x.sizeId === s._id} onClick={() => set({ sizeId: s._id })} label={s.label} sub={+s.price ? `+${peso(s.price)}` : 'Included'} />)}
          </Group>}
          {item.sweet && <Group title="Sweetness">
            {menu.sweetness.map((s) => <Choice key={s} on={L.sweet === s} onClick={() => set({ sweet: s })} label={s} />)}
          </Group>}
          {addons.length > 0 && <Group title="Add-ons" hint="Optional">
            {addons.map((a) => { const on = L.addonIds.includes(a._id); return <Choice key={a._id} on={on} onClick={() => set({ addonIds: on ? L.addonIds.filter((i) => i !== a._id) : [...L.addonIds, a._id] })} label={a.label} sub={`+${peso(a.price)}`} />; })}
          </Group>}
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
const Group = ({ title, hint, children }) => <div className="grp"><h4>{title}{hint && <i>{hint}</i>}</h4><div className="choices">{children}</div></div>;
const Choice = ({ on, onClick, label, sub }) => <button className={`choice ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}><b>{label}</b>{sub && <small>{sub}</small>}</button>;

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
