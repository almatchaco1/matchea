// Form helpers: a labelled field that shows its error underneath, and a hook
// that keeps per-field errors for a form.
import { useCallback, useState } from 'react';

export function Field({ id, label, error, hint, children, style, className = '' }) {
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`} style={style}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? <div className="ferr" id={`${id}-err`} role="alert">{error}</div> : hint ? <div className="fhint">{hint}</div> : null}
    </div>
  );
}

/** Inline error under a row (recipe lines, option rows). */
export const RowError = ({ msg }) => (msg ? <div className="ferr" role="alert">{msg}</div> : null);

/**
 * useErrors(): errs object + helpers.
 *  - check(errs) sets them and focuses the first invalid input; returns true when valid
 *  - clear(key) removes one field's error while the user fixes it
 *  - fromServer(e, toast) shows server field errors inline (or the message as a toast)
 */
export function useErrors() {
  const [errs, setErrs] = useState({});
  const focusFirst = () => setTimeout(() => document.querySelector('.modal .invalid input, .modal .invalid select, .modal [aria-invalid="true"], .invalid input')?.focus(), 30);
  const check = useCallback((e) => {
    setErrs(e);
    if (Object.keys(e).length) { focusFirst(); return false; }
    return true;
  }, []);
  const clear = useCallback((...keys) => setErrs((p) => {
    if (!keys.some((k) => k in p)) return p;
    const n = { ...p }; keys.forEach((k) => delete n[k]); return n;
  }), []);
  const fromServer = useCallback((e, toast) => {
    if (e.fields && Object.keys(e.fields).length) { setErrs(e.fields); focusFirst(); }
    else toast(e.message);
  }, []);
  const inv = (k) => (errs[k] ? { 'aria-invalid': true } : {});
  return { errs, setErrs, check, clear, fromServer, inv };
}
