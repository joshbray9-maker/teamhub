// SCAT6 (Sport Concussion Assessment Tool 6, Br J Sports Med 2023;57:622) results for the Injury
// report's SCAT tab. Staff copy the scores off a completed SCAT6 form; this file only adds them
// up (the totals printed on the form) and lines a player's tests up against their baseline.
// It never judges a result: the app shows the change from baseline, and the clinician decides.

// Step 1: symptom evaluation, each rated 0 (none) to 6 (severe)
export const SYMPTOMS = [
  ['headache', 'Headache'], ['pressure', 'Pressure in head'], ['neck', 'Neck pain'], ['nausea', 'Nausea or vomiting'],
  ['dizzy', 'Dizziness'], ['blurred', 'Blurred vision'], ['balance', 'Balance problems'], ['light', 'Sensitivity to light'],
  ['noise', 'Sensitivity to noise'], ['slowed', 'Feeling slowed down'], ['fog', 'Feeling like "in a fog"'], ['not_right', '"Don\'t feel right"'],
  ['concentrating', 'Difficulty concentrating'], ['remembering', 'Difficulty remembering'], ['fatigue', 'Fatigue or low energy'], ['confusion', 'Confusion'],
  ['drowsy', 'Drowsiness'], ['emotional', 'More emotional'], ['irritable', 'Irritability'], ['sad', 'Sadness'],
  ['anxious', 'Nervous or anxious'], ['sleep', 'Trouble falling asleep (if applicable)'],
];
export const SYMPTOM_MAX = 6;

export const KINDS = { baseline: 'Baseline', injury: 'Post-injury' };

// the scores entered on the form (besides the symptoms), with their maximums
export const FIELDS = {
  pct_normal: { label: '% of normal', max: 100 },
  im1: { label: 'Trial 1', max: 10 }, im2: { label: 'Trial 2', max: 10 }, im3: { label: 'Trial 3', max: 10 },
  digits: { label: 'Digits backwards', max: 4 }, months: { label: 'Months in reverse', max: 1 },
  bess_double: { label: 'Double leg stance', max: 10 }, bess_single: { label: 'Single leg stance', max: 10 }, bess_tandem: { label: 'Tandem stance', max: 10 },
  gait1: { label: 'Trial 1', unit: 's', time: true }, gait2: { label: 'Trial 2', unit: 's', time: true }, gait3: { label: 'Trial 3', unit: 's', time: true },
  dual: { label: 'Dual-task gait time', unit: 's', time: true }, dual_cog: { label: 'Dual-task cognitive accuracy', unit: '%', max: 100 },
  recall: { label: 'Delayed recall', max: 10 },
};

/** A typed score as a number, or null when blank or not a number. */
export function score(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
/** Why a typed value can't be saved, or '' when it's fine. */
export function badScore(field, v) {
  const n = score(v); if (String(v ?? '').trim() === '') return '';
  if (n === null || n < 0) return 'Enter a number';
  const f = FIELDS[field] || { max: SYMPTOM_MAX };
  if (f.max !== undefined && n > f.max) return `Out of ${f.max}`;
  if (!f.time && f.max !== 100 && !Number.isInteger(n)) return 'Whole number';
  return '';
}

const sum = (xs) => { const v = xs.filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const allOf = (xs) => (xs.every((x) => x !== null) ? sum(xs) : null);

/** The form's totals from one test's entered data (null where a part wasn't done). */
export function totals(d = {}) {
  const sym = SYMPTOMS.map(([k]) => score((d.symptoms || {})[k]));
  const rated = sym.filter((x) => x !== null);
  const gait = ['gait1', 'gait2', 'gait3'].map((k) => score(d[k])).filter((x) => x !== null && x > 0);
  const imm = ['im1', 'im2', 'im3'].map((k) => score(d[k])), conc = [score(d.digits), score(d.months)];
  const bess = [score(d.bess_double), score(d.bess_single), score(d.bess_tandem)];
  return {
    symptoms: rated.length ? rated.filter((x) => x > 0).length : null,   // number of symptoms, of 22
    severity: rated.length ? sum(rated) : null,                         // symptom severity score, of 132
    pct_normal: score(d.pct_normal),
    immediate: allOf(imm),                                              // immediate memory, of 30
    concentration: allOf(conc),                                         // of 5
    bess: allOf(bess),                                                  // mBESS errors, of 30
    gait: gait.length ? Math.min(...gait) : null,                       // fastest tandem gait time
    dual: score(d.dual),
    recall: score(d.recall),                                            // delayed recall, of 10
  };
}

// the progress table's columns: lower = fewer symptoms / errors / faster, shown as the plain change
export const SUMMARY = [
  { k: 'symptoms', label: 'Symptoms', of: 22 },
  { k: 'severity', label: 'Severity', of: 132 },
  { k: 'pct_normal', label: '% normal', unit: '%' },
  { k: 'immediate', label: 'Immediate memory', of: 30 },
  { k: 'concentration', label: 'Concentration', of: 5 },
  { k: 'recall', label: 'Delayed recall', of: 10 },
  { k: 'bess', label: 'mBESS errors', of: 30 },
  { k: 'gait', label: 'Tandem gait', unit: 's', dp: 1 },
  { k: 'dual', label: 'Dual-task gait', unit: 's', dp: 1 },
];

/** The baseline a test is compared with: the latest baseline on or before its date, else the earliest baseline. */
export function baselineFor(test, tests) {
  const bl = tests.filter((t) => t.kind === 'baseline' && t.id !== test.id).sort((a, b) => (a.tested_on < b.tested_on ? -1 : 1));
  if (!bl.length) return null;
  return [...bl].reverse().find((t) => t.tested_on <= test.tested_on) || bl[0];
}

/** One player's tests, oldest first, each with its totals, baseline and the change from it. */
export function progress(tests) {
  const sorted = [...tests].sort((a, b) => (a.tested_on === b.tested_on ? String(a.created_at || '').localeCompare(String(b.created_at || '')) : a.tested_on < b.tested_on ? -1 : 1));
  return sorted.map((t) => {
    const tot = totals(t.data), base = t.kind === 'baseline' ? null : baselineFor(t, tests);
    const bt = base ? totals(base.data) : null;
    const change = bt ? Object.fromEntries(SUMMARY.map(({ k }) => [k, tot[k] !== null && bt[k] !== null ? Math.round((tot[k] - bt[k]) * 10) / 10 : null])) : null;
    return { test: t, totals: tot, base, change };
  });
}

/** Days from an injury date to a test date (null if either is missing). */
export function daysSince(from, to) {
  if (!from || !to) return null;
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);
}
