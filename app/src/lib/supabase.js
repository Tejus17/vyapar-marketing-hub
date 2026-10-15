import { createClient } from '@supabase/supabase-js';

// The publishable key is designed to be public (it ships in the browser);
// what it may do is limited by the row-level security rules in supabase/schema.sql.
// Never put the secret key here.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://kpwjhooqygwypdhgwtli.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_J0r2bcrRVW8d8iduj-21GA_xVzAw5F-';

export const supabase = createClient(url, key, { auth: { persistSession: false } });

export const VENDORS = 'hub_vendors';
export const NOTES = 'hub_vendor_notes';
