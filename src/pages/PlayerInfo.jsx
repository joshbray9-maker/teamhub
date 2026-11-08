import { useState } from 'react';
import PageHead from '../components/PageHead.jsx';
import { PACK } from '../lib/playerPack.js';
import { store } from '../lib/util.js';

// Player info (basketball): the S&C player pack's need-to-know, one tab per topic and a picker per section
export default function PlayerInfo() {
  const [tabId, setTabId] = useState(() => store.get('pi-tab') || PACK.tabs[0].id);
  const tab = PACK.tabs.find((x) => x.id === tabId) || PACK.tabs[0];
  const [secs, setSecs] = useState({});
  const sec = tab.sections.find((s) => s.id === secs[tab.id]) || tab.sections[0];
  const pickTab = (id) => { setTabId(id); store.set('pi-tab', id); };

  const acts = <div className="seg" role="tablist">{PACK.tabs.map((x) => <button key={x.id} role="tab" aria-selected={x.id === tab.id} className={x.id === tab.id ? 'on' : ''} onClick={() => pickTab(x.id)}>{x.label}</button>)}</div>;
  return <>
    <PageHead title="Player info" actions={acts} />
    {tab.sections.length > 1 && <div className="pi-secs" role="tablist" aria-label={tab.label}>
      {tab.sections.map((s) => <button key={s.id} role="tab" aria-selected={s.id === sec.id} className={s.id === sec.id ? 'on' : ''} onClick={() => setSecs((o) => ({ ...o, [tab.id]: s.id }))}>{s.label}</button>)}
    </div>}
    <div className="pi">
      <div className="pi-head"><h2>{sec.title}</h2>{sec.sub && <p className="muted">{sec.sub}</p>}</div>
      {sec.blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  </>;
}

function Block({ b }) {
  const head = b.title && <div className="card-head"><h3>{b.title}</h3>{b.sub && <span className="muted small">{b.sub}</span>}</div>;
  if (b.kind === 'text') return <p className={`pi-text ${b.strong ? 'strong' : ''} ${b.small ? 'muted small' : ''}`}>{b.text}</p>;
  if (b.kind === 'cards') return <div className="pi-cards">{b.items.map((c, i) => <section key={i} className="card pi-card">
    {c.tag && <div className="pi-tag">{c.tag}</div>}
    <h3>{c.title}</h3>
    {c.text && <p>{c.text}</p>}
    {c.bullets && <ul className="pi-list">{c.bullets.map((x) => <li key={x}>{x}</li>)}</ul>}
    {c.meta && <div className="pi-meta">{c.meta}</div>}
  </section>)}</div>;
  if (b.kind === 'list') {
    const L = b.numbered ? 'ol' : 'ul';
    return <section className="card">{head}<L className={b.numbered ? 'pi-rules' : 'pi-list'}>{b.items.map((x) => <li key={x}>{x}</li>)}</L></section>;
  }
  if (b.kind === 'plan') return <section className="card">{head}<dl className="pi-plan">{b.rows.map(([label, lines]) => <div key={label}><dt>{label}</dt><dd>{lines.map((x) => <div key={x}>{x}</div>)}</dd></div>)}</dl></section>;
  return <section className="card">{head}
    <div className="tbl-wrap"><table className="tbl pi-tbl"><thead><tr>{b.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{b.rows.map((r, i) => (Array.isArray(r)
        ? <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        : <tr key={i} className="pi-group"><td colSpan={b.cols.length}>{r.group}{r.sub && <span> · {r.sub}</span>}</td></tr>))}</tbody></table></div>
    {b.note && <p className="muted small" style={{ margin: 0 }}>{b.note}</p>}
  </section>;
}
