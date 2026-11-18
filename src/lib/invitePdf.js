// A team's invite links as a printable PDF: every roster player (number, name, their athlete
// link or "Joined"), then the staff links that open this team. Built from the members list
// (api.listMembers) and the roster (api.listPlayers); nothing here talks to the database.

const ROLE = { admin: 'Admin', coach: 'Coach', sportsmed: 'Sports med', viewer: 'Viewer', athlete: 'Athlete' };
const opens = (m, teamId) => m.role === 'admin' || !m.teams || m.teams.includes(teamId);

/** Rows for one team. players: the roster; members: listMembers(); joinUrl(token) → link.
 * { players: [{ num, name, status: 'joined'|'link'|'none', url, who }], staff: [{ name, role, status, url }] } */
export function inviteRows(team, players, members, joinUrl) {
  const byNum = (a, b) => (+a.num || 999) - (+b.num || 999) || a.name.localeCompare(b.name);
  const ps = players.filter((p) => p.active !== false).sort(byNum).map((p) => {
    const joined = members.find((m) => !m.pending && m.player_id === p.id);
    const link = members.find((m) => m.pending && m.role === 'athlete' && m.player_id === p.id);
    return joined ? { num: p.num || '', name: p.name, id: p.id, status: 'joined', url: '', who: joined.email }
      : link ? { num: p.num || '', name: p.name, id: p.id, status: 'link', url: joinUrl(link.token), who: '' }
      : { num: p.num || '', name: p.name, id: p.id, status: 'none', url: '', who: '' };
  });
  const staff = members.filter((m) => m.role !== 'athlete' && opens(m, team.id)).map((m) => ({
    name: m.pending ? m.label || m.email || 'Invite link' : m.email, role: ROLE[m.role] || m.role,
    status: m.pending ? 'link' : 'joined', url: m.pending && m.token ? joinUrl(m.token) : '', who: m.pending ? m.email || '' : '' }))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'link' ? -1 : 1));
  return { players: ps, staff };
}

/** The PDF (a jsPDF doc): title, then a Players table and a Staff table. */
export function buildInvitePdf(JsPDF, { orgName, teamName, rows, date }) {
  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), L = 40, R = W - 40;
  let y = 0;
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20); doc.text(`${teamName} · invite links`, L, 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(`${orgName}${date ? ' · ' + date : ''} · each link works once, for the person named`, L, 64);
    y = 86;
  };
  const room = (h) => { if (y + h > H - 40) { doc.addPage(); head(); } };
  const table = (title, cols, items, cell) => {
    room(44); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20); doc.text(title, L, y); y += 8;
    doc.setDrawColor(200); doc.setFillColor(242, 242, 244); doc.rect(L, y, R - L, 18, 'F');
    doc.setFontSize(8); doc.setTextColor(90); cols.forEach(([x, l]) => doc.text(l.toUpperCase(), x, y + 12)); y += 18;
    if (!items.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text('None', L + 6, y + 14); y += 28; return; }
    items.forEach((it, i) => {
      const lines = cell(it); const h = Math.max(20, 6 + 11 * Math.max(...lines.map((c) => c.lines.length)));
      room(h); if (i % 2) { doc.setFillColor(250, 250, 251); doc.rect(L, y, R - L, h, 'F'); }
      lines.forEach((c) => {
        doc.setFont('helvetica', c.bold ? 'bold' : 'normal'); doc.setFontSize(c.size || 9.5); doc.setTextColor(...(c.color || [20, 20, 20]));
        c.lines.forEach((t, j) => (c.link ? doc.textWithLink(t, c.x, y + 13 + j * 11, { url: c.link }) : doc.text(t, c.x, y + 13 + j * 11)));
      });
      doc.setDrawColor(225); doc.line(L, y + h, R, y + h); y += h;
    });
    y += 22;
  };
  const urlCell = (it, x) => {
    if (it.status === 'joined') return { x, lines: [`Joined${it.who ? ' · ' + it.who : ''}`], color: [30, 120, 60] };
    if (it.status === 'none') return { x, lines: ['No link yet'], color: [150, 150, 150] };
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); // measure at the size it is drawn
    return { x, lines: doc.splitTextToSize(it.url, R - x - 6), link: it.url, color: [25, 80, 170], size: 7.8 };
  };
  const nameLines = (t, w) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); return doc.splitTextToSize(t, w); };
  head();
  const P = rows.players, S = rows.staff;
  table(`Players (${P.length})`, [[L + 6, '#'], [L + 36, 'Name'], [L + 172, 'Invite link']], P, (p) => [
    { x: L + 6, lines: [String(p.num || '')] }, { x: L + 36, lines: nameLines(p.name, 130), bold: true }, urlCell(p, L + 172)]);
  table(`Staff (${S.length})`, [[L + 6, 'Name'], [L + 150, 'Access'], [L + 200, 'Invite link']], S, (s) => [
    { x: L + 6, lines: nameLines(s.name, 140), bold: true }, { x: L + 150, lines: [s.role] }, urlCell(s, L + 200)]);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Page ${i} of ${n}`, R, H - 22, { align: 'right' }); }
  return doc;
}
