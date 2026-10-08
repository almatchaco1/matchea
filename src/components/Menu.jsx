import { useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt } from '../lib/format';
import { priceLine } from '../shared/pricing.mjs';
import Modal, { ConfirmButton } from './Modal';
import { Field, RowError, useErrors } from './Field';
import { checkProduct, checkSettings, checkStoreInfo, LIMITS } from '../shared/rules.mjs';
import { DRINK_IMAGES, allowedAddons, imageOf, sceneBg } from '../lib/drinkImages';
import { photoUrl } from '../shared/menu-defaults.mjs';
import { starterSteps, toSteps } from '../lib/recipe';
import { AdminBtn } from './Locked';
import { QrSettingsModal } from './PayQr';
import DecorPicker from './DecorPicker';
import DeliverySettings from './DeliverySettings';
import { checkDeliverySettings, DELIVERY_DEFAULTS } from '../shared/delivery.mjs';

export default function Menu({ data, refresh, toast, isAdmin, goInventory }) {
  const [switching, setSwitching] = useState('');
  const setAvailable = async (p, available) => {
    setSwitching(p._id);
    try { await api.patch(`/products/${p._id}/available`, { available }); toast(available ? `${p.name} is available again` : `${p.name} is now Not available`); refresh(); }
    catch (e) { toast(e.message); } finally { setSwitching(''); }
  };
  const { products, ingredients, settings: s } = data;
  const [modal, setModal] = useState(null); // { kind: 'prod', p } | { kind: 'shop' }
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const ingById = Object.fromEntries(ingredients.map((i) => [i._id, i]));
  const done = (m) => { setModal(null); toast(m); refresh(); };

  const costOf = (p) => {
    if (!s) return 0;
    const { usage } = priceLine({}, p, s);
    return Object.entries(usage).reduce((a, [k, q]) => a + q * (+ingById[k]?.cost || 0), 0);
  };

  return (
    <>
      <div className="toolbar">
        <h2 className="sec grow">Menu</h2>
        <AdminBtn allowed={isAdmin} className="btn" onClick={() => setModal({ kind: 'qr' })}>GCash QR</AdminBtn>
        <AdminBtn allowed={isAdmin} className="btn" onClick={() => setModal({ kind: 'shop' })}>Shop & options</AdminBtn>
        <AdminBtn allowed={isAdmin} className="btn primary" onClick={() => setModal({ kind: 'prod' })}>Add drink</AdminBtn>
      </div>
      <p className="muted mn10-note">Ran out of something? Tap <b>Not available</b> and the drink stays on the menu but can't be ordered, at the counter or online.{!isAdmin && ' Only an admin can change the menu or prices.'}</p>

      {(() => {
        const rows = products.map((p) => {
          const price = p.price + (p.hasSizes !== false ? +s?.sizes?.[0]?.price || 0 : 0);
          const c = costOf(p);
          return { p, price, c, margin: c && price ? Math.round(((price - c) / price) * 100) : null };
        });
        const live = rows.filter((r) => r.p.active);
        const margins = live.filter((r) => r.margin != null);
        const avg = margins.length ? Math.round(margins.reduce((a, r) => a + r.margin, 0) / margins.length) : null;
        const best = margins.slice().sort((a, b) => b.margin - a.margin)[0];
        const cats = ['All', ...new Set(rows.map((r) => r.p.cat).filter(Boolean))];
        const rank = (r) => (!r.p.active ? 2 : r.p.available === false ? 1 : 0); // hidden drinks go last
        const shown = rows.slice().sort((a, b) => rank(a) - rank(b)).filter((r) => (cat === 'All' || r.p.cat === cat) && (!q || r.p.name.toLowerCase().includes(q.toLowerCase())));
        return (<>
          <div className="mn10-stats">
            <div className="mn10-stat k1"><small>On the menu</small><b className="num">{live.length}</b><span>{rows.length - live.length ? `${rows.length - live.length} hidden` : 'none hidden'}</span></div>
            <div className="mn10-stat"><small>Can be ordered</small><b className="num">{live.filter((r) => r.p.available !== false).length}</b><span>{live.filter((r) => r.p.available === false).length ? `${live.filter((r) => r.p.available === false).length} not available` : 'all available'}</span></div>
            <div className="mn10-stat"><small>Average margin</small><b className="num">{avg != null ? `${avg}%` : '—'}</b><span>after ingredient cost</span></div>
            <div className="mn10-stat"><small>Best margin</small><b className="num">{best ? `${best.margin}%` : '—'}</b><span>{best ? best.p.name : 'add ingredient costs'}</span></div>
          </div>
          <div className="mn10-bar">
            <div className="mn10-cats" role="tablist" aria-label="Category">
              {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}<i>{c === 'All' ? rows.length : rows.filter((r) => r.p.cat === c).length}</i></button>)}
            </div>
            <label className="mn10-search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.5-4.5" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a drink…" aria-label="Find a drink" /></label>
          </div>
          {!products.length ? <div className="panel empty">{data.loaded ? 'No drinks yet.' : 'Loading…'}</div> : !shown.length ? <div className="panel empty">No drinks match.</div> : (
            <div className="mn10-grid">
              {shown.map(({ p, price, c, margin }) => {
                const st = !p.active ? 'hidden' : p.available === false ? 'off' : 'on';
                return (
                  <article key={p._id} className={`mn10-card s-${st}`} data-drink={p.name}>
                    <div className="mn10-photo" style={sceneBg(imageOf(p))}>
                      {imageOf(p) ? <img src={imageOf(p)} alt="" /> : <span className="mn10-nophoto">No photo</span>}
                      <span className={`mn10-status s-${st}`}>{st === 'hidden' ? 'Hidden' : st === 'off' ? 'Not available' : 'Available'}</span>
                      {p.bestSeller && <span className="mn10-best">★ Best seller</span>}
                    </div>
                    <div className="mn10-body">
                      <div className="mn10-top">
                        <small>{p.cat || 'No category'}</small><h3>{p.name}</h3>
                        <b className="num mn10-price">{peso(price)}</b>
                      </div>
                      <div className="mn10-money">
                        <span>Cost <b className="num">{c ? peso(c) : '—'}</b></span>
                        <span>Margin <b className="num">{margin != null ? `${margin}%` : '—'}</b></span>
                      </div>
                      <div className="mn10-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, margin || 0))}%` }} className={margin == null ? '' : margin >= 70 ? 'good' : margin >= 50 ? 'ok' : 'low'} /></div>
                      <ul className="mn10-recipe" aria-label="Recipe">
                        {p.recipe.map((r, k) => <li key={k}><b className="num">{qfmt(r.qty)}{ingById[r.ing]?.unit || ''}</b> {ingById[r.ing]?.name || '(deleted ingredient)'}</li>)}
                        {p.milkQty > 0 && <li><b className="num">{p.milkQty}ml</b> {s?.milks?.length === 1 ? s.milks[0].label : 'milk of choice'}</li>}
                        {!p.recipe.length && !p.milkQty && <li className="none">No recipe yet</li>}
                      </ul>
                      {s && <p className="mn10-adds">Add-ons: {allowedAddons(p, s).map((a) => a.label).join(', ') || 'none'}</p>}
                      <div className="mn10-actions">
                        {p.active && (p.available === false
                          ? <button className="btn sm primary" disabled={switching === p._id} onClick={() => setAvailable(p, true)}>Make available</button>
                          : <button className="btn sm" disabled={switching === p._id} onClick={() => setAvailable(p, false)}>Not available</button>)}
                        <AdminBtn allowed={isAdmin} className="btn sm ghost" onClick={() => setModal({ kind: 'prod', p })}>Edit</AdminBtn>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>);
      })()}
      {s && <p className="muted" style={{ fontSize: 12 }}>Cost and margin use the {s.sizes?.[0]?.label || 'base'} size{s.milks?.[0] ? ` with ${s.milks[0].label}` : ''}, from each ingredient's cost per unit.{goInventory && <> <button className="linkbtn" onClick={goInventory}>Change ingredient costs in Inventory</button> (tap the cost to edit it).</>}</p>}


      {modal?.kind === 'prod' && <ProductModal p={modal.p} data={data} settings={s} onClose={() => setModal(null)} done={done} toast={toast} />}
      {modal?.kind === 'qr' && <QrSettingsModal settings={s} onClose={() => setModal(null)} done={done} toast={toast} />}
      {modal?.kind === 'shop' && <ShopModal s={s} ingredients={ingredients} onClose={() => setModal(null)} done={done} toast={toast} />}
    </>
  );
}

export function ProductModal({ p, data, settings, onClose, done, toast, focusSteps = false, noDelete = false }) {
  const shopAddons = settings?.addons || [];
  const ings = data.ingredients;
  const [f, setF] = useState(() => {
    const base = p ? { ...p, available: p.available !== false, bestSeller: !!p.bestSeller, recipe: p.recipe.map((r) => ({ ...r })) } : { name: '', cat: '', price: '', desc: '', image: '', milkQty: 0, hasSizes: true, sweet: true, active: true, available: true, recipe: [] };
    // A drink without its own list allows everything; show that as all boxes ticked
    return { ...base, stepsText: (p?.steps || []).map((x, i) => `${i + 1}. ${x}`).join('\n'), image: p ? imageOf(p).replace(/\?v=\d+$/, '') : '', addons: allowedAddons(base, settings).map((a) => String(a._id)) };
  });
  const [customImg, setCustomImg] = useState(() => !!(p?.image && !DRINK_IMAGES.some((d) => d.path === f.image)));
  const { errs, check, clear, fromServer } = useErrors();
  const set = (k, v) => { setF({ ...f, [k]: v }); clear(k === 'stepsText' ? 'steps' : k, k === 'milkQty' ? 'recipe' : k); };
  const setRow = (i, patch) => { setF({ ...f, recipe: f.recipe.map((r, k) => (k === i ? { ...r, ...patch } : r)) }); clear(`recipe.${i}.ing`, `recipe.${i}.qty`, 'recipe'); };
  const cats = [...new Set(data.products.map((x) => x.cat))];

  const save = async () => {
    const { stepsText, ...body } = f;
    body.steps = toSteps(stepsText);
    if (!check(checkProduct(body))) return;
    try {
      if (p) await api.put(`/products/${p._id}`, body); else await api.post('/products', body);
      done('Saved');
    } catch (e) { fromServer(e, toast); }
  };
  const del = async () => { try { await api.del(`/products/${p._id}`); done('Moved to the Recycle bin (Reports → Recycle bin) for 30 days'); } catch (e) { toast(e.message); } };
  const yesNo = (id, label, key, yes = 'Yes', no = 'No') => (
    <Field id={id} label={label}>
      <select id={id} value={f[key] ? '1' : '0'} onChange={(e) => set(key, e.target.value === '1')}><option value="1">{yes}</option><option value="0">{no}</option></select>
    </Field>
  );
  // Removing a recipe row shifts row numbers, so drop row errors instead of mislabeling them
  const removeRow = (i) => { setF({ ...f, recipe: f.recipe.filter((_, k) => k !== i) }); clear(...f.recipe.flatMap((_, k) => [`recipe.${k}.ing`, `recipe.${k}.qty`])); };

  return (
    <Modal wide title={p ? 'Edit drink' : 'New drink'} onClose={onClose}
      footer={<>{p && !noDelete && <ConfirmButton style={{ marginRight: 'auto' }} onConfirm={del} confirmText="Tap again to delete">Delete</ConfirmButton>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="row">
        <Field id="pName" label="Name" error={errs.name} style={{ flex: '2 1 200px' }}>
          <input id="pName" value={f.name} maxLength={LIMITS.name} onChange={(e) => set('name', e.target.value)} placeholder="Matcha Latte" />
        </Field>
        <Field id="pCat" label="Category" error={errs.cat}>
          <input id="pCat" list="catList" value={f.cat} maxLength={LIMITS.cat} onChange={(e) => set('cat', e.target.value)} placeholder="Signature" />
          <datalist id="catList">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field id="pPrice" label="Base price (₱)" error={errs.price}>
          <input id="pPrice" type="number" inputMode="decimal" min="0" step="any" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="200" />
        </Field>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="img-preview">{f.image ? <img src={photoUrl(f.image)} alt="" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} /> : <span>No photo</span>}</div>
        <Field id="pImg" label="Photo" error={errs.image} style={{ flex: '1 1 240px' }} hint={customImg ? 'Paste a link to a square photo (https://…)' : 'Photos are in the public/drinks folder'}>
          {customImg
            ? <input id="pImg" value={f.image} maxLength={300} placeholder="https://…" onChange={(e) => set('image', e.target.value.trim())} />
            : <select id="pImg" value={f.image} onChange={(e) => { if (e.target.value === '__other') { setCustomImg(true); set('image', ''); } else set('image', e.target.value); }}>
                <option value="">No photo</option>
                {DRINK_IMAGES.map((d) => <option key={d.path} value={d.path}>{d.label}</option>)}
                <option value="__other">Other (paste a link)…</option>
              </select>}
        </Field>
      </div>
      <Field id="pDesc" label="Short description (shown on the register)" error={errs.desc} hint={`${(f.desc || '').length}/${LIMITS.desc}`}>
        <input id="pDesc" maxLength={LIMITS.desc} value={f.desc || ''} onChange={(e) => set('desc', e.target.value)} placeholder="Smooth, earthy, timeless." />
      </Field>
      <div className="row">
        <Field id="pMilk" label="Milk per drink (ml, 0 = none)" error={errs.milkQty}>
          <input id="pMilk" type="number" inputMode="decimal" min="0" step="any" value={f.milkQty} onChange={(e) => set('milkQty', e.target.value)} />
        </Field>
        {yesNo('pSizes', 'Size options', 'hasSizes', 'Yes', 'No (single size)')}
        {yesNo('pSweet', 'Sweetness choice', 'sweet')}
        {yesNo('pActive', 'On menu', 'active', 'Shown', 'Hidden')}
        {yesNo('pAvail', 'Can be ordered', 'available', 'Available', 'Not available')}
        {yesNo('pBest', 'Best seller badge', 'bestSeller', 'Show badge', 'No')}
      </div>
      {shopAddons.length > 0 && (
        <div className="opt-group">
          <h4>Add-ons customers can choose for this drink</h4>
          <div className="checks">
            {shopAddons.map((a) => {
              const id = String(a._id), on = f.addons.includes(id);
              return (
                <label key={id} className={`check ${on ? 'on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => set('addons', on ? f.addons.filter((x) => x !== id) : [...f.addons, id])} />
                  {a.label} <small className="num">+{peso(a.price)}</small>
                </label>
              );
            })}
          </div>
          <RowError msg={errs.addons} />
        </div>
      )}
      <div className="opt-group">
        <h4>Recipe per base-size drink</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!f.recipe.length && <div className="muted">No ingredients yet.</div>}
          {f.recipe.map((r, i) => (
            <div key={i}>
              <div className="recipe-row">
                <select value={r.ing} onChange={(e) => setRow(i, { ing: e.target.value })} aria-label="Ingredient" aria-invalid={!!errs[`recipe.${i}.ing`]}>
                  {ings.map((x) => <option key={x._id} value={x._id}>{x.name} ({x.unit})</option>)}
                </select>
                <input type="number" inputMode="decimal" min="0" step="any" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} aria-label="Quantity" aria-invalid={!!errs[`recipe.${i}.qty`]} />
                <button className="btn sm ghost" onClick={() => removeRow(i)} aria-label="Remove">✕</button>
              </div>
              <RowError msg={errs[`recipe.${i}.ing`] || errs[`recipe.${i}.qty`]} />
            </div>
          ))}
        </div>
        <button className="btn sm" style={{ marginTop: 8 }} disabled={!ings.length}
          onClick={() => { const used = new Set(f.recipe.map((r) => r.ing)); const next = ings.find((x) => !used.has(x._id)) || ings[0]; set('recipe', [...f.recipe, { ing: next._id, qty: '' }]); }}>Add ingredient</button>
        <RowError msg={errs.recipe} />
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Milk and cups come from the chosen milk and size, so leave them out here.</p>
      </div>
      <div className="opt-group">
        <h4>How to make it (shown to the barista)</h4>
        <Field id="pSteps" error={errs.steps} hint={`One step per line · amounts above are added automatically and adjust to the size`}>
          <textarea id="pSteps" rows={7} autoFocus={focusSteps} value={f.stepsText} onChange={(e) => set('stepsText', e.target.value)}
            placeholder={'1. Sift the matcha into the bowl.\n2. Add hot water and whisk until frothy.\n3. Fill the cup with ice…'} />
        </Field>
        {!f.stepsText.trim() && (
          <button className="btn sm" type="button" onClick={() => set('stepsText', starterSteps(+f.milkQty > 0).map((x, i) => `${i + 1}. ${x}`).join('\n'))}>Start from sample steps</button>
        )}
      </div>
    </Modal>
  );
}

function ShopModal({ s, ingredients, onClose, done, toast }) {
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(s)));
  const { errs, check, clear, fromServer } = useErrors();
  const set = (k, v) => { setF({ ...f, [k]: v }); clear(k); };
  const setOpt = (key, i, patch) => { setF({ ...f, [key]: f[key].map((o, k) => (k === i ? { ...o, ...patch } : o)) }); clear(...Object.keys(patch).map((p) => `${key}.${i}.${p}`), key); };
  const removeOpt = (key, i) => { setF({ ...f, [key]: f[key].filter((_, k) => k !== i) }); clear(...Object.keys(errs).filter((k) => k.startsWith(key + '.'))); };
  const save = async () => {
    if (!check({ ...checkSettings(f), ...checkStoreInfo(f), ...checkDeliverySettings({ ...DELIVERY_DEFAULTS, ...(f.delivery || {}) }) })) return;
    try { await api.put('/settings', f); done('Saved'); } catch (e) { fromServer(e, toast); }
  };
  const inv = (k) => ({ 'aria-invalid': !!errs[k] });

  const groups = [
    ['sizes', 'Sizes', 'Size multiplier', 'Cup used', 'cup', 'mult', { label: '', price: 0, mult: 1, cup: null }],
    ['milks', 'Milk choices', '', 'Milk ingredient', 'ing', null, { label: '', price: 0, ing: null }],
    ['addons', 'Add-ons', 'Qty used', 'Ingredient', 'ing', 'qty', { label: '', price: 0, ing: null, qty: 0 }],
  ];
  const errCount = Object.keys(errs).length;

  return (
    <Modal wide title="Shop & options" onClose={onClose}
      footer={<>{errCount > 0 && <span className="ferr" style={{ marginRight: 'auto' }}>Fix {errCount} highlighted {errCount === 1 ? 'field' : 'fields'} to save.</span>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="row">
        <Field id="sName" label="Shop name" error={errs.name} style={{ flex: '2 1 200px' }}>
          <input id="sName" value={f.name} maxLength={LIMITS.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field id="sAddr" label="Address (receipt and website)" error={errs.address} hint="Leave blank until you have a permanent location" style={{ flex: '2 1 200px' }}>
          <input id="sAddr" value={f.address} maxLength={LIMITS.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field id="sTin" label="TIN" error={errs.tin} hint="000-000-000-000">
          <input id="sTin" value={f.tin} inputMode="numeric" maxLength={19} placeholder="000-000-000-000"
            onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 14); set('tin', d.replace(/^(\d{3})(\d{0,3})?(\d{0,3})?(\d{0,5})?$/, (_, a, b, c, x) => [a, b, c, x].filter(Boolean).join('-'))); }} />
        </Field>
      </div>
      <Field id="sFoot" label="Receipt footer" error={errs.footer}>
        <input id="sFoot" value={f.footer} maxLength={LIMITS.footer} onChange={(e) => set('footer', e.target.value)} />
      </Field>
      <div className="opt-group">
        <h4>Online ordering</h4>
        <label className={`check ${f.onlineOpen !== false ? 'on' : ''}`}>
          <input type="checkbox" checked={f.onlineOpen !== false} onChange={(e) => set('onlineOpen', e.target.checked)} /> <span>Customers can order online</span>
        </label>
        <Field id="sOnMsg" label="Message on the order page (optional)" error={errs.onlineMessage} hint="Shown at the top, e.g. “Closed today, see you tomorrow!”">
          <input id="sOnMsg" value={f.onlineMessage || ''} maxLength={160} onChange={(e) => set('onlineMessage', e.target.value)} />
        </Field>
      </div>
      <DeliverySettings f={f} setF={setF} errs={errs} />
      <DecorPicker f={f} set={set} />
      <div className="opt-group">
        <h4>Store info <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· shown at the bottom of the website. Leave blank what you don’t have yet.</span></h4>
        <div className="row">
          <Field id="sPhone" label="Phone" error={errs.contactPhone} hint="0917 123 4567">
            <input id="sPhone" inputMode="tel" maxLength={20} value={f.contactPhone || ''} onChange={(e) => set('contactPhone', e.target.value)} />
          </Field>
          <Field id="sEmail" label="Email" error={errs.contactEmail}>
            <input id="sEmail" type="email" maxLength={80} value={f.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
        </div>
        <Field id="sHours" label="Opening hours" error={errs.hours} hint="One line each, up to 4 lines">
          <textarea id="sHours" rows={3} maxLength={160} value={f.hours || ''} placeholder={'Mon–Sat 10:00 AM – 8:00 PM\nSunday 12:00 – 6:00 PM'} onChange={(e) => set('hours', e.target.value)} />
        </Field>
        <div className="row">
          <Field id="sFb" label="Facebook" error={errs.facebook} hint="Page link or @name"><input id="sFb" value={f.facebook || ''} placeholder="facebook.com/matchea" onChange={(e) => set('facebook', e.target.value)} /></Field>
          <Field id="sIg" label="Instagram" error={errs.instagram} hint="Page link or @name"><input id="sIg" value={f.instagram || ''} placeholder="@matchea" onChange={(e) => set('instagram', e.target.value)} /></Field>
          <Field id="sTt" label="TikTok" error={errs.tiktok} hint="Page link or @name"><input id="sTt" value={f.tiktok || ''} placeholder="@matchea" onChange={(e) => set('tiktok', e.target.value)} /></Field>
        </div>
      </div>

      {groups.map(([key, title, numLabel, ingLabel, ingField, numField, blank]) => (
        <div className="opt-group" key={key}>
          <h4>{title}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="opt-row opt-head"><span>Label</span><span>+ Price ₱</span><span>{ingLabel}</span><span>{numLabel}</span><span /></div>
            {f[key].map((o, i) => {
              const p = `${key}.${i}`;
              return (
                <div key={o._id || 'n' + i}>
                  <div className="opt-row">
                    <input value={o.label} maxLength={LIMITS.optionLabel} onChange={(e) => setOpt(key, i, { label: e.target.value })} aria-label="Label" {...inv(`${p}.label`)} />
                    <input type="number" inputMode="decimal" min="0" step="any" value={o.price} onChange={(e) => setOpt(key, i, { price: e.target.value })} aria-label="Extra price" {...inv(`${p}.price`)} />
                    <select value={o[ingField] || ''} onChange={(e) => setOpt(key, i, { [ingField]: e.target.value || null })} aria-label={ingLabel} {...inv(`${p}.${ingField}`)}>
                      <option value="">— none —</option>
                      {ingredients.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                    {numField ? <input type="number" inputMode="decimal" min="0" step="any" value={o[numField]} onChange={(e) => setOpt(key, i, { [numField]: e.target.value })} aria-label={numLabel} {...inv(`${p}.${numField}`)} /> : <span />}
                    <button className="btn sm ghost opt-del" onClick={() => removeOpt(key, i)} aria-label="Remove" disabled={key === 'sizes' && f.sizes.length === 1} title={key === 'sizes' && f.sizes.length === 1 ? 'Keep at least one size' : undefined}>✕</button>
                  </div>
                  <RowError msg={['label', 'price', ingField, numField].filter(Boolean).map((k) => errs[`${p}.${k}`]).find(Boolean)} />
                </div>
              );
            })}
          </div>
          <RowError msg={errs[key]} />
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => set(key, [...f[key], { ...blank }])}>Add {title.toLowerCase().replace(/ choices$/, ' choice').replace(/s$/, '')}</button>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Size multiplier scales every recipe amount (1.3 = 30% more matcha and milk). The first size and milk are the defaults.</p>
    </Modal>
  );
}
