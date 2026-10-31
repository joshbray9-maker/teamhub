// Team chat: one plain-text group thread per team, live for everyone in the team's organization.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { iso, fmtDate, todayISO, pad } from '../lib/util.js';
import PageHead from '../components/PageHead.jsx';
import Icon from '../components/Icon.jsx';

const PAGE = 100;
const GROUP_MS = 5 * 60 * 1000; // consecutive messages from one person within 5 min share a header
const MAX = 4000;

const nameOf = (m) => (m.author || 'Former member').split('@')[0];
const timeOf = (ts) => { const d = new Date(ts); const h = d.getHours(); return `${((h + 11) % 12) + 1}:${pad(d.getMinutes())} ${h >= 12 ? 'pm' : 'am'}`; };
function dayLabel(day) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return day === todayISO() ? 'Today' : day === iso(y) ? 'Yesterday' : fmtDate(day, true);
}
// plain text with web links made clickable (React escapes everything else)
function Body({ text }) {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p));
}
const addMsgs = (list, add) => {
  const seen = new Set(list.map((m) => m.id));
  return [...list, ...add.filter((m) => !seen.has(m.id))].sort((a, b) => a.ts - b.ts);
};

export default function Chat() {
  const H = useHub(); const t = H.team;
  const [msgs, setMsgs] = useState(null);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef(), box = useRef();
  const stick = useRef(true);       // keep the view pinned to the newest message
  const keepFrom = useRef(null);    // scroll height before loading earlier messages

  useEffect(() => {
    let live = true;
    setMsgs(null); stick.current = true;
    H.api.listChat(t.id, { limit: PAGE })
      .then((r) => { if (live) { setMsgs((cur) => addMsgs(cur || [], r)); setMore(r.length === PAGE); } })
      .catch((e) => { if (live) { setMsgs([]); H.toast('Could not load chat: ' + e.message); } });
    const off = H.api.subscribeChat(t.id, {
      onAdd: (m) => setMsgs((cur) => addMsgs(cur || [], [m])),
      onRemove: (id) => setMsgs((cur) => (cur ? cur.filter((m) => m.id !== id) : cur)),
    });
    return () => { live = false; off(); };
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = list.current; if (!el || !msgs) return;
    if (keepFrom.current != null) { el.scrollTop = el.scrollHeight - keepFrom.current; keepFrom.current = null; }
    else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  const onScroll = () => { const el = list.current; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const earlier = async () => {
    try {
      const r = await H.api.listChat(t.id, { beforeTs: msgs[0].ts, limit: PAGE });
      keepFrom.current = list.current.scrollHeight;
      setMsgs((cur) => addMsgs(cur, r)); setMore(r.length === PAGE);
    } catch (e) { H.toast('Could not load earlier messages: ' + e.message); }
  };
  const send = async () => {
    const body = text.trim(); if (!body || sending) return;
    if (body.length > MAX) { H.toast(`Messages can be up to ${MAX} characters.`); return; }
    setSending(true); stick.current = true;
    try { const m = await H.api.sendChat(t.id, body); setMsgs((cur) => addMsgs(cur || [], [m])); setText(''); }
    catch (e) { H.toast('Could not send. ' + (e.message || 'Try again.')); }
    finally { setSending(false); box.current && box.current.focus(); }
  };
  const remove = async (m) => {
    if (!(await H.confirm('Delete message?', 'It will be removed for everyone in this chat.', 'Delete'))) return;
    try { await H.api.deleteChat(m.id); setMsgs((cur) => cur.filter((x) => x.id !== m.id)); }
    catch (e) { H.toast('Could not delete. ' + e.message); }
  };
  // grow the box with its text, up to a few lines
  useLayoutEffect(() => { const el = box.current; if (!el) return; el.style.height = 'auto'; const h = el.scrollHeight + el.offsetHeight - el.clientHeight; el.style.height = Math.min(h, 160) + 'px'; el.style.overflowY = h > 160 ? 'auto' : 'hidden'; }, [text]);

  let prev = null;
  return <>
    <PageHead title="Chat" />
    <section className="card chat">
      <div className="chat-list" ref={list} onScroll={onScroll} aria-live="polite">
        {!msgs ? <div className="muted small chat-empty">Loading…</div>
          : !msgs.length ? <div className="chat-empty"><Icon n="chat" /><b>No messages yet</b><span className="muted small">Everyone with access to {t.name} sees this chat.</span></div>
          : <>
            {more && <button className="btn sm chat-more" onClick={earlier}>Load earlier messages</button>}
            {msgs.map((m) => {
              const day = iso(new Date(m.ts));
              const newDay = !prev || iso(new Date(prev.ts)) !== day;
              const head = newDay || prev.user_id !== m.user_id || prev.author !== m.author || m.ts - prev.ts > GROUP_MS;
              const mine = H.user && m.user_id === H.user.id;
              prev = m;
              return <Fragment key={m.id}>
                {newDay && <div className="chat-day"><span>{dayLabel(day)}</span></div>}
                <div className={`chat-msg ${mine ? 'mine' : ''} ${head ? 'head' : ''}`}>
                  {head && <div className="chat-meta"><b title={m.author}>{mine ? 'You' : nameOf(m)}</b> <span className="muted">{timeOf(m.ts)}</span></div>}
                  <div className="chat-row">
                    <div className="chat-bubble" title={head ? undefined : timeOf(m.ts)}><Body text={m.body} /></div>
                    {(mine || H.isAdmin) && <button className="icon-btn chat-del" aria-label="Delete message" onClick={() => remove(m)}><Icon n="trash" /></button>}
                  </div>
                </div>
              </Fragment>;
            })}
          </>}
      </div>
      <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={box} className="input" rows={1} value={text} maxLength={MAX} placeholder={`Message ${t.name}`} aria-label="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn primary" type="submit" disabled={!text.trim() || sending}>Send</button>
      </form>
    </section>
  </>;
}
