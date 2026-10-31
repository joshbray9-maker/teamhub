import { initials } from '../lib/util.js';

export default function Logo({ t, cls = '' }) {
  if (!t) return <span className={`logo ${cls}`}>TH</span>;
  if (t.logo) return <span className={`logo has-img ${cls}`}><img src={t.logo} alt="" /></span>;
  return <span className={`logo ${cls}`}>{initials(t.name)}</span>;
}
