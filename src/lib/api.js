// Picks the data backend: Supabase when its keys are set, otherwise (dev builds only) the
// local demo backend running on the exported artifact data. The `import.meta.env.DEV`
// check is replaced with `false` in production builds, so the demo backend and its data
// are left out of what gets deployed.
import { isSupabaseConfigured } from './supabaseClient.js';

export const backendMode = isSupabaseConfigured ? 'supabase' : import.meta.env.DEV ? 'demo' : 'none';

export async function getApi() {
  if (isSupabaseConfigured) return (await import('./api.supabase.js')).api;
  if (import.meta.env.DEV) return (await import('./api.demo.js')).api;
  return null;
}
