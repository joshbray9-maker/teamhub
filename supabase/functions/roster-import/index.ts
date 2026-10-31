// Roster import from a web page. A signed-in admin/coach sends {team_id, url}; the function
// fetches that public page and returns its HTML tables as text rows. Nothing is stored here:
// the browser picks the roster table, shows it for review, and saves only what the coach
// confirms (through the normal RLS-checked players API).
//
// Works for pages that publish the roster as an HTML table (e.g. SIDEARM school sites such as
// gaiters.ca). EliteProspects blocks automated requests and HockeyTech/CSSHL pages build their
// rosters with JavaScript, so those get a clear message instead; this function does not try
// to get around either.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import { tablesFromDoc } from '../_shared/htmlTables.js';

const UA = 'TeamHub roster import';
const MAX_BYTES = 4_000_000;

// Only public web pages: https, a real host name, no IP addresses or internal names.
function checkUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('That is not a web address'); }
  if (u.protocol !== 'https:') throw new Error('Use an https:// address');
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|supabase\.co|supabase\.in)$/.test(h)) throw new Error('That address is not a public website');
  if (/(^|\.)eliteprospects\.com$/.test(h)) throw new Error('EliteProspects blocks automated requests. Save the roster page as a PDF and use Import CSV / PDF instead.');
  return u;
}

Deno.serve(async (req) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ') || !body.team_id || !body.url) return json({ error: 'unauthorized' }, 401);
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { authorization: auth } }, auth: { persistSession: false } });
    const { data: ok } = await user.rpc('can_edit_team', { p_team: body.team_id });
    if (!ok) return json({ error: 'Only admins and coaches of this team can import a roster' }, 403);

    // follow redirects by hand so every hop is checked before it's fetched
    let url = checkUrl(String(body.url).trim()), r: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'manual' });
      const next = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!next) break;
      url = checkUrl(new URL(next, url).toString());
    }
    if (!r || !r.ok) return json({ error: `${url.hostname} answered ${r ? r.status : 'nothing'}${r && r.status === 403 ? ' (it blocks automated requests)' : ''}` }, 200);
    const html = await r.text();
    if (html.length > MAX_BYTES) return json({ error: 'That page is too large to read' }, 200);
    const tables = tablesFromDoc(new DOMParser().parseFromString(html, 'text/html')!);
    if (!tables.length) {
      const js = /hockeytech|statview|__NEXT_DATA__|ng-app/i.test(html);
      return json({ error: `No roster table found on ${url.hostname}${js ? ': the page builds its roster with JavaScript' : ''}. Save the roster as a PDF and use Import CSV / PDF instead.` }, 200);
    }
    return json({ tables, host: url.hostname });
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
