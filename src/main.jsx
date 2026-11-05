import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getApi, backendMode } from './lib/api.js';
import { HubProvider } from './lib/hub.jsx';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import PublicSchedule from './pages/PublicSchedule.jsx';
import PublicSpectator from './pages/PublicSpectator.jsx';
import PlayerAssess from './pages/PlayerAssess.jsx';
import Join, { JOIN_KEY } from './pages/Join.jsx';
import './styles.css';

function NotConfigured() {
  return <div className="auth"><div className="card"><div className="card-head"><h2>TeamHub isn't connected yet</h2></div>
    <p className="muted" style={{ margin: 0 }}>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see README) and redeploy.</p></div></div>;
}

function Root() {
  const [api, setApi] = useState(null);
  const [user, setUser] = useState(undefined);
  useEffect(() => { getApi().then((a) => { setApi(a); if (!a) setUser(null); }); }, []);
  useEffect(() => {
    if (!api) return;
    api.getUser().then(setUser);
    return api.onAuthChange(setUser);
  }, [api]);
  // an invite link opened before signing up (e.g. the confirmation email went to the home page)
  const pending = (() => { try { return user && localStorage.getItem(JOIN_KEY); } catch { return null; } })();
  return <Routes>
    <Route path="/join/:token" element={backendMode === 'none' ? <NotConfigured /> : <Join api={api} user={user} />} />
    <Route path="/schedule/:org" element={api || backendMode === 'none' ? <PublicSchedule api={api} /> : null} />
    <Route path="/s/:token" element={api || backendMode === 'none' ? <PublicSpectator api={api} /> : null} />
    <Route path="/a/:token" element={api || backendMode === 'none' ? <PlayerAssess api={api} /> : null} />
    <Route path="/reset" element={api ? <Login api={api} mode="reset" /> : null} />
    <Route path="*" element={backendMode === 'none' ? <NotConfigured /> : user === undefined ? <div className="loading">Loading TeamHub…</div>
      : !user ? <Login api={api} /> : pending ? <Navigate to={`/join/${pending}`} replace /> : <HubProvider key={user.id} api={api} user={user}><App /></HubProvider>} />
  </Routes>;
}

createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><Root /></BrowserRouter></StrictMode>);
