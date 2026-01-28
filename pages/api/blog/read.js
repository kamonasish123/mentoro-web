// pages/api/blog/read.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { post_id, user_id } = req.body
  if (!post_id) return res.status(400).json({ error: 'Missing post_id' })

  // Read envs at request time (prevents build-time crash)
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // If an authenticated user, attempt to insert a deduped row into blog_reads
    if (user_id) {
      const { data, error } = await supabaseAdmin
        .from('blog_reads')
        .insert([{ post_id, user_id }], { returning: 'representation' })

      if (!error && data && data.length > 0) {
        // Insert created a blog_reads row — trigger (if present) should have incremented blog_posts.reads.
        return res.status(200).json({ inserted: 1 })
      }

      // Unique-violation (already recorded) -> treat as no new insert
      if (error) {
        // Postgres unique violation code
        if (error.code === '23505' || (error.details && error.details.toLowerCase().includes('duplicate'))) {
          return res.status(200).json({ inserted: 0 })
        }

        // FK error (user not found) or other error -> fallback to incrementing post reads directly
        console.warn('blog_reads insert error, falling back to direct increment:', error)
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('increment_post_reads_direct', { p_id: post_id })
        if (!rpcErr) return res.status(200).json({ inserted: 1, reads: rpcData?.[0]?.reads ?? null })
        console.error('fallback rpc failed', rpcErr)
        return res.status(500).json({ error: 'Failed to record read' })
      }
    }

    // Anonymous visitor -> increment blog_posts.reads atomically via RPC (recommended)
    const { data: anonData, error: anonErr } = await supabaseAdmin.rpc('increment_post_reads_direct', { p_id: post_id })
    if (anonErr) {
      console.error('anonymous increment rpc error', anonErr)
      return res.status(500).json({ error: 'Failed to record anonymous read' })
    }
    return res.status(200).json({ inserted: 1, reads: anonData?.[0]?.reads ?? null })

  } catch (e) {
    console.error('read handler unexpected error', e)
    return res.status(500).json({ error: 'Unexpected error' })
  }
}