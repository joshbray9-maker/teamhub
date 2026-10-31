import { initials } from '../lib/util.js';

export default function Logo({ t, cls = '' }) {
  if (!t) return <span className={`logo ${cls}`}>TH</span>;
  // a team's own logo, else its organization's (orgLogo / logo_url on an organization)
  const src = t.logo || t.orgLogo || t.logo_url;
  if (src) return <span className={`logo has-img ${cls}`}><img src={src} alt="" /></span>;
  return <span className={`logo ${cls}`}>{initials(t.name)}</span>;
}
