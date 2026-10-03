// Owner: daily automatic backups of all data, plus "Back up now" and downloads.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';

const size = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Backups({ toast }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [dir, setDir] = useState(null); // editing the copy folder
  const [dirErr, setDirErr] = useState('');
  const [restore, setRestore] = useState(null);
  const load = () => api.get('/backups').then(setD).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const now = async () => {
    setBusy('now');
    try { const b = await api.post('/backups'); toast(`Backup saved: ${Object.values(b.counts).reduce((a, n) => a + n, 0).toLocaleString()} records`); load(); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  };
  const get = async (name) => {
    setBusy(name);
    try { await api.saveFile(`/backups/${encodeURIComponent(name)}`, name); } catch (e) { toast(e.message); } finally { setBusy(''); }
  };
  const saveDir = async () => {
    setBusy('dir'); setDirErr('');
    try { const r = await api.put('/backups/copy-folder', { dir }); setDir(null); toast(r.copyDir ? (r.copy?.ok ? 'Extra copy is on. A backup was just copied there.' : `Saved, but copying failed: ${r.copy?.error}`) : 'Extra copy turned off'); load(); }
    catch (e) { setDirErr(e.fields?.dir || e.message); } finally { setBusy(''); }
  };
  const list = d?.backups || [];
  const last = list[0];
  const stale = !last || Date.now() - new Date(last.createdAt) > 36 * 3600e3;
  return (
    <section>
      <div className="toolbar">
        <h2 className="sec grow">Backups</h2>
        <button className="btn primary" onClick={now} disabled={busy === 'now'}>{busy === 'now' ? 'Backing up…' : 'Back up now'}</button>
      </div>
      <div className={`panel backup-note ${stale ? 'warn' : ''}`}>
        {d && (last
          ? <p><b>Last backup: {when(last.createdAt)}</b>{stale ? ' — that’s over a day ago. Is the server running?' : ''}</p>
          : <p><b>No backups yet.</b> The first one is made about a minute after the server starts.</p>)}
        <p className="muted">
          Everything is saved automatically once a day (sales, menu, stock, staff, customers and stamps). The newest {d?.keep || 30} are kept on the computer running the server.
          A backup is also made every time you close the day. The files contain customer details, so don’t share them.
        </p>
      </div>
      <div className={`panel backup-note ${d && !d.copyDir ? 'warn' : ''}`}>
        <p><b>Extra copy somewhere safe</b>{d?.copyDir ? <> · <span className={`pill ${d.copy?.ok === false ? 'bad' : 'ok'}`}>{d.copy?.ok === false ? 'Last copy failed' : 'On'}</span></> : ' · off'}</p>
        {dir == null ? (
          <>
            <p className="muted">{d?.copyDir
              ? <>Every backup is also copied to <code>{d.copyDir}</code>.{d.copy?.ok === false && <span className="ferr"> {d.copy.error}</span>}</>
              : 'If this computer breaks or is stolen, the backups on it are gone too. Pick a folder that syncs online, like a Google Drive or Dropbox folder, and every backup is copied there automatically.'}</p>
            <button className="btn sm" onClick={() => { setDir(d?.copyDir || ''); setDirErr(''); }}>{d?.copyDir ? 'Change folder' : 'Choose a folder'}</button>
          </>
        ) : (
          <div className="bk-dir">
            <label className="field"><span>Folder on the computer running the server</span>
              <input value={dir} onChange={(e) => { setDir(e.target.value); setDirErr(''); }} placeholder="/Users/you/Library/CloudStorage/GoogleDrive-you@gmail.com/My Drive/Matchéa backups" autoFocus /></label>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>On a Mac: create the folder in Finder, then hold Option, right-click it and choose “Copy … as Pathname”, and paste it here. Leave it empty to turn this off.</p>
            {dirErr && <div className="ferr" role="alert">{dirErr}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn sm ghost" onClick={() => setDir(null)}>Cancel</button><button className="btn sm primary" onClick={saveDir} disabled={busy === 'dir'}>{busy === 'dir' ? 'Checking…' : 'Save'}</button></div>
          </div>
        )}
      </div>
      {list.length > 0 && (
        <div className="panel tbl-wrap">
          <table>
            <thead><tr><th>Backup</th><th>Type</th><th className="r">Size</th><th></th></tr></thead>
            <tbody>
              {list.slice(0, 10).map((b) => (
                <tr key={b.name}>
                  <td>{when(b.createdAt)}</td>
                  <td>{/-daily/.test(b.name) ? 'Daily' : /-closing/.test(b.name) ? 'Day closed' : /-prerestore/.test(b.name) ? 'Before a restore' : /-reset/.test(b.name) ? 'Before starting fresh' : 'Manual'}</td>
                  <td className="r num">{size(b.size)}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}><button className="btn sm" disabled={busy === b.name} onClick={() => get(b.name)}>{busy === b.name ? 'Downloading…' : 'Download'}</button>{' '}<button className="btn sm ghost" onClick={() => setRestore(b)}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 10 && <p className="muted" style={{ fontSize: 12, margin: '8px 12px' }}>+{list.length - 10} older backups in the server’s backups folder.</p>}
        </div>
      )}
      {restore && <RestoreModal b={restore} onClose={() => setRestore(null)} toast={toast} done={() => { setRestore(null); load(); }} />}
    </section>
  );
}

function RestoreModal({ b, onClose, toast, done }) {
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/backups/${encodeURIComponent(b.name)}/restore`, { confirm: txt.trim() }); toast('Restored. Reloading…'); done(); setTimeout(() => window.location.reload(), 1200); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Restore a backup" onClose={onClose}
      footer={<><button className="btn" onClick={onClose} autoFocus>Cancel</button><button className="btn danger" onClick={go} disabled={busy || txt.trim() !== 'RESTORE'}>{busy ? 'Restoring…' : 'Restore'}</button></>}>
      <div className="warnbox" style={{ marginTop: 0 }}>
        Everything goes back to how it was on <b>{when(b.createdAt)}</b>: sales, menu, stock, staff and customers. Anything after that is replaced.
        A backup of right now is saved first, so you can undo this.
      </div>
      <label className="field" style={{ marginTop: 12 }}><span>Type <b>RESTORE</b> to confirm</span>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} autoCapitalize="characters" autoComplete="off" /></label>
      {err && <div className="ferr" role="alert">{err}</div>}
    </Modal>
  );
}
