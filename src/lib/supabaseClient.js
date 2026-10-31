import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Publishable (anon) key only. The service-role key never belongs in the browser.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = !!(url && key);
export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
