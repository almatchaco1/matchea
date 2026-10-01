// Set up a receipt printer on this device (saved in this browser only).
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { loadPrinterSettings, savePrinterSettings, support, connectPrinter, disconnectPrinter, isConnected, reconnect, printTest } from '../lib/printer';

const KINDS = [
  ['usb', 'USB cable', 'usb'],
  ['serial', 'Bluetooth (paired on this computer)', 'serial'],
  ['bluetooth', 'Bluetooth (tablet / phone)', 'bluetooth'],
];

export default function PrinterSettings({ onClose, toast }) {
  const [s, setS] = useState(loadPrinterSettings);
  const [connected, setConnected] = useState(isConnected());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const can = support();
  const none = !can.usb && !can.serial && !can.bluetooth;
  useEffect(() => { if (s.kind && !isConnected()) reconnect(s).then((c) => setConnected(!!c)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (p) => { const n = { ...s, ...p }; setS(n); savePrinterSettings(n); };
  const run = async (what, fn, ok) => {
    setBusy(what); setErr('');
    try { await fn(); if (ok) toast(ok); } catch (e) { if (e?.name !== 'NotFoundError') setErr(e.message || String(e)); } finally { setBusy(''); setConnected(isConnected()); }
  };
  const connect = (kind) => run('connect', async () => { const c = await connectPrinter(kind); save({ kind, name: c.name }); }, 'Printer connected');
  const forget = () => run('forget', async () => { await disconnectPrinter(); save({ kind: '', name: '' }); });

  return (
    <Modal title="Receipt printer" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      {none ? (
        <p style={{ marginTop: 0 }}>This browser can’t talk to receipt printers directly. Use <b>Google Chrome</b> or <b>Microsoft Edge</b> on a computer or Android tablet. Until then, receipts print through the normal print window.</p>
      ) : (
        <>
          <div className={`printer-status ${connected ? 'on' : s.kind ? 'warn' : ''}`}>
            {connected ? <><b>Connected:</b> {s.name || 'receipt printer'}</> : s.kind ? <><b>{s.name || 'Printer'}</b> is set up but not connected. Turn it on, then press Connect again.</> : <>No receipt printer yet. Receipts use the normal print window.</>}
          </div>
          <h4 className="ps-h">Connect a printer</h4>
          <div className="ps-kinds">
            {KINDS.map(([k, label, feature]) => (
              <button key={k} className={`btn ${s.kind === k ? 'primary' : ''}`} disabled={!can[feature] || busy === 'connect'} onClick={() => connect(k)} title={can[feature] ? '' : 'Not available in this browser'}>{label}</button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Your browser will ask which printer to use. You only do this once on each device.</p>

          <div className="row">
            <div className="field"><label htmlFor="psW">Paper width</label>
              <select id="psW" value={s.width} onChange={(e) => save({ width: +e.target.value })}><option value={32}>58 mm (small)</option><option value={48}>80 mm (wide)</option></select></div>
          </div>
          <label className="check-row"><input type="checkbox" checked={s.logo !== false} onChange={(e) => save({ logo: e.target.checked })} /> Print the AL Matcha Co logo at the top</label>
          <label className="check-row"><input type="checkbox" checked={s.auto} onChange={(e) => save({ auto: e.target.checked })} /> Print the receipt automatically after each sale</label>
          <label className="check-row"><input type="checkbox" checked={!!s.labels} onChange={(e) => save({ labels: e.target.checked })} /> Print cup labels automatically after each sale (one per drink, with the customer’s name)</label>

          {err && <div className="formerr" role="alert" style={{ marginTop: 10 }}>{err}</div>}
          <div className="ps-actions">
            <button className="btn" disabled={!s.kind || !!busy} onClick={() => run('test', printTest, 'Test page sent')}>{busy === 'test' ? 'Printing…' : 'Print test page'}</button>
            {s.kind && <button className="btn ghost" disabled={!!busy} onClick={forget}>Remove printer</button>}
          </div>
        </>
      )}
    </Modal>
  );
}
