// Stroke icons (ported from the TeamHub artifact).
/* eslint-disable */
const IC = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',
  pitch:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>',
  book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6"/>',
  chart:'<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
  cross:'<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  dumbbell:'<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  grip:'<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  chev:'<path d="M9 6l6 6-6 6"/>', chevl:'<path d="M15 6l-6 6 6 6"/>', down:'<path d="M7 10l5 5 5-5"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', check:'<path d="M5 12l5 5 9-10"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>', trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>', ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
};
export default function Icon({ n }) {
  return <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[n] || '' }} />;
}
