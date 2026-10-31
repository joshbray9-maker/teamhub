import { useHub } from '../lib/hub.jsx';
import { SPORTS, LEVELS } from '../lib/util.js';

export default function PageHead({ title, actions }) {
  const { team: t } = useHub();
  return <header className="page-head"><div><div className="eyebrow">{t.name} · {SPORTS[t.sport]} · {LEVELS[t.level]}</div><h1>{title}</h1></div><div className="head-actions">{actions}</div></header>;
}
