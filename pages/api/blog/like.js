// pages/api/blog/like.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // read envs at runtime, create client inside handler to avoid compile-time crash
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Ensure .env.local or host envs are configured.')
    return res.status(500).json({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // server-only client: disable session persistence
    auth: { persistSession: false }
  })

  const { post_id, user_id } = req.body || {}
  if (!post_id || !user_id) return res.status(400).json({ error: 'Missing post_id or user_id' })

  try {
    const { data: existing, error: checkError } = await supabase
      .from('blog_likes')
      .select('post_id')
      .eq('post_id', post_id)
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (checkError) {
      console.error('Like check error:', checkError)
      return res.status(500).json({ error: 'Like check failed' })
    }

    if (existing) {
      const { data: postRow } = await supabase.from('blog_posts').select('likes').eq('id', post_id).limit(1).maybeSingle()
      return res.status(200).json({ liked: false, likes: postRow?.likes ?? null })
    }

    const { error: insertError } = await supabase.from('blog_likes').insert({ post_id, user_id })

    if (insertError) {
      console.warn('Like insert error (treated as already liked or constraint):', insertError)
      const { data: postRow } = await supabase.from('blog_posts').select('likes').eq('id', post_id).limit(1).maybeSingle()
      return res.status(200).json({ liked: false, likes: postRow?.likes ?? null })
    }

    // read authoritative counter
    const { data: updatedPost } = await supabase.from('blog_posts').select('likes').eq('id', post_id).limit(1).maybeSingle()
    return res.status(200).json({ liked: true, likes: updatedPost?.likes ?? null })
  } catch (e) {
    console.error('Unexpected /api/blog/like error:', e)
    return res.status(500).json({ error: 'Internal error' })
  }
}