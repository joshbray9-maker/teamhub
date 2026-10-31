import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

// Bottom sheet on phones, centred dialog on desktop. Escape / backdrop close it.
export default function Modal({ title, onClose, actions, wide, children }) {
  const ref = useRef();
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const f = ref.current && ref.current.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
    if (f && !matchMedia('(max-width:860px)').matches) setTimeout(() => f.focus(), 30);
    return () => document.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal" ref={ref}>
      <div className="modal-back" onClick={onClose} />
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon n="x" /></button></header>
        <div className="sheet-body">{children}</div>
        {actions && <footer className="sheet-foot">{actions}</footer>}
      </div>
    </div>
  );
}
