// pages/api/profiles-bulk.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase service env missing for profiles-bulk API');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    // safety cap
    const unique = Array.from(new Set(ids)).slice(0, 2000);

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, full_name, institution, country')
      .in('id', unique);

    if (error) {
      console.error('profiles-bulk supabase error', error);
      return res.status(500).json({ error: error.message || String(error) });
    }

    return res.status(200).json({ profiles: profiles || [] });
  } catch (err) {
    console.error('profiles-bulk unexpected', err);
    return res.status(500).json({ error: String(err) });
  }
}