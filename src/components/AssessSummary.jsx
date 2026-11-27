// A player's self-assessment numbers (coaches and admins): average practice and gym RPE from the
// daily check-ins, the average of each 1–5 game question, and completion % for each assessment
// (practice, gym, games), side by side for a few time frames. Shown on the player profile
// (PlayerReport) and in Athlete reports. Completion counts from the day the team's first answer
// came in, so sessions from before the team started using it don't count as missed.
import { useEffect, useState } from 'react';
import { useHub } from '../lib/hub.jsx';
import { fmtDate, todayISO } from '../lib/util.js';
import { addDays } from '../lib/sc.js';
import { activeQuestions, avgOf } from '../lib/selfAssess.js';
import { sessionDays, checkinStats, gameStats, fmtAvg, fmtPct } from '../lib/checkin.js';

/** The team's check-ins, game self-assessments and questions: { checkins, assess, qs } (null while loading). */
export function useAssessData() {
  const H = useHub(); const t = H.team;
  const [d, setD] = useState(null);
  const load = () => Promise.all([H.api.listCheckins(t.id), H.api.listSelfAssessments(t.id), H.api.getSetting(t.id, 'assess_questions')])
    .then(([checkins, assess, qs]) => setD({ checkins, assess, qs })).catch(() => setD({ checkins: [], assess: [], qs: null }));
  useEffect(() => { if (H.isCoach) load(); }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return [d, load];
}

const first = (dates) => dates.reduce((m, x) => (!m || x < m ? x : m), '');

/** Everything for one player over from..to (either may be ''). */
export function summaryFor(p, data, H, from, to) {
  const t = H.team, today = todayISO();
  const ciStart = first(data.checkins.map((c) => c.date)), gaStart = first(data.assess.map((a) => a.game_date));
  const ciFrom = [from, ciStart].filter(Boolean).sort().pop() || '', gaFrom = [from, gaStart].filter(Boolean).sort().pop() || '';
  const end = to && to < today ? to : today;
  const sessions = ciStart ? sessionDays(t, H.orgOf(t), H.tdata.events, (H.tdata.sc || {}).days || {}, ciFrom, end) : {};
  const ci = checkinStats(data.checkins.filter((c) => c.player_id === p.id), sessions, { from: ciFrom, to: end, today });
  const mine = data.assess.filter((a) => a.player_id === p.id && (!from || a.game_date >= from) && (!to || a.game_date <= to));
  const game = gaStart ? gameStats(mine, H.tdata.league.games, t, { from: gaFrom, to: end, today }) : { due: 0, done: 0, pct: null };
  const scales = activeQuestions(data.qs).filter((q) => q.type === 'scale').map((q) => ({ q, avg: avgOf(mine, q.id) }));
  return { ci, game, scales };
}

const done = (x) => (x.due ? `${fmtPct(x.pct)} · ${x.done}/${x.due}` : '—');

/** The table: one column per time frame ([label, from, to]). */
export default function AssessSummary({ p, data, frames }) {
  const H = useHub();
  if (!data) return <div className="loading">Loading…</div>;
  const s = frames.map(([, from, to]) => summaryFor(p, data, H, from, to));
  const rows = [
    ['Practice RPE (avg)', (x) => fmtAvg(x.ci.practice.avg), 'Practice check-ins', (x) => done(x.ci.practice)],
    ['Gym RPE (avg)', (x) => fmtAvg(x.ci.gym.avg), 'Gym check-ins', (x) => done(x.ci.gym)],
  ];
  const notes = data.checkins.filter((c) => c.player_id === p.id && c.note).slice(0, 5);
  return <>
    <div className="tbl-wrap"><table className="tbl as-sum">
      <thead><tr><th /> {frames.map(([l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
      <tbody>
        {rows.map(([l1, f1, l2, f2]) => [
          <tr key={l1}><td><b>{l1}</b></td>{s.map((x, i) => <td key={i} className="num tnum"><b>{f1(x)}</b></td>)}</tr>,
          <tr key={l2} className="as-sub"><td>{l2} completed</td>{s.map((x, i) => <td key={i} className="num tnum">{f2(x)}</td>)}</tr>])}
        {s[0].scales.map(({ q }, k) => <tr key={q.id}><td><b>{q.short}</b> <span className="muted small">game avg</span></td>{s.map((x, i) => <td key={i} className="num tnum"><b>{fmtAvg(x.scales[k].avg)}</b></td>)}</tr>)}
        <tr className="as-sub"><td>Game self-assessments completed</td>{s.map((x, i) => <td key={i} className="num tnum">{done(x.game)}</td>)}</tr>
      </tbody></table></div>
    {notes.length > 0 && <div className="as-notes"><h4>Recent check-in notes</h4>
      <ul>{notes.map((c) => <li key={c.date}><b>{fmtDate(c.date, true)}</b> {c.note}</li>)}</ul></div>}
  </>;
}

/** Time frames for the profile: last 7 days, last 28 days, all. */
export const recentFrames = () => { const today = todayISO(); return [['Last 7 days', addDays(today, -6), today], ['Last 28 days', addDays(today, -27), today], ['All', '', '']]; };
