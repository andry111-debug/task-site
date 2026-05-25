import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseReady = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseReady
  ? createClient(supabaseUrl, supabaseKey)
  : null;
