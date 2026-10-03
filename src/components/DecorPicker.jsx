// Menu → Shop & options: pick any decorations for the website (and the top string for the POS), with live previews.
import { Field } from './Field';
import { DECOR, GREETINGS, GREETING_MAX, cleanDecor } from '../shared/decor.mjs';
import { DecorString, DecorHang, DecorBg } from '../lib/decor';

const GROUPS = [
  ['string', 'Along the top', 'pick one'],
  ['hang', 'Hanging from the header', 'website only'],
  ['bg', 'Background', 'website only · mix any'],
];

function Scene({ decor, big }) {
  return (
    <div className={`dp-scene ${big ? 'big' : ''}`} aria-hidden="true">
      <DecorBg decor={decor} box />
      <div className="dp-head"><i className="dp-logo" /><i className="dp-bar" /><DecorString decor={decor} /><DecorHang decor={decor} /></div>
    </div>
  );
}

export default function DecorPicker({ f, set }) {
  const decor = cleanDecor(f.decor);
  const toggle = (d) => {
    const on = decor.includes(d.id);
    let next = on ? decor.filter((x) => x !== d.id) : [...decor, d.id];
    if (!on && d.kind === 'string') next = next.filter((x) => x === d.id || DECOR.find((y) => y.id === x)?.kind !== 'string');
    set('decor', cleanDecor(next));
  };
  return (
    <div className="opt-group dp">
      <h4>Decorations <span className="muted dp-note">· tap to turn on or off, then Save</span></h4>
      {decor.length > 0 && (
        <div className="dp-live">
          <Scene decor={decor} big />
          <div className="dp-live-bar"><span>{decor.length} on: {decor.map((x) => DECOR.find((d) => d.id === x).label).join(', ')}</span>
            <button type="button" className="btn sm ghost" onClick={() => set('decor', [])}>Turn all off</button></div>
        </div>
      )}
      {GROUPS.map(([kind, title, sub]) => (
        <div key={kind} className="dp-group">
          <div className="dp-gh"><b>{title}</b> <span className="muted">{sub}</span></div>
          <div className="dp-grid">
            {DECOR.filter((d) => d.kind === kind).map((d) => {
              const on = decor.includes(d.id);
              return (
                <button type="button" key={d.id} className={`dp-tile ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(d)}>
                  <Scene decor={[d.id]} />
                  <span className="dp-t"><b>{d.label}</b><small>{d.sub}</small></span>
                  <i className="dp-tick" aria-hidden="true">✓</i>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <label className={`check ${f.decorPos !== false ? 'on' : ''}`}>
        <input type="checkbox" checked={f.decorPos !== false} onChange={(e) => set('decorPos', e.target.checked)} /> <span>Show the top string on the POS too</span>
      </label>
      <Field id="sGreet" label="Greeting on the website home page (optional)" hint="Pick one below or type your own. Leave blank for none.">
        <input id="sGreet" value={f.decorGreeting || ''} maxLength={GREETING_MAX} placeholder="e.g. Maligayang Pasko! Merry Christmas from Matchéa" onChange={(e) => set('decorGreeting', e.target.value)} />
      </Field>
      <div className="dp-greets">
        {GREETINGS.map((g) => <button type="button" key={g} className="chip" aria-pressed={f.decorGreeting === g} onClick={() => set('decorGreeting', f.decorGreeting === g ? '' : g)}>{g}</button>)}
      </div>
    </div>
  );
}
