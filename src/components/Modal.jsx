import { useEffect, useState } from 'react';

export default function Modal({ title, aside, children, footer, onClose, wide, className = '' }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-h"><h3>{title}</h3>{aside}</div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/** A button that needs a second tap to confirm (for deletes / voids). */
export function ConfirmButton({ children, confirmText = 'Tap again to confirm', onConfirm, className = 'btn danger', ...rest }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button {...rest} className={className} onClick={(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmText : children}
    </button>
  );
}
