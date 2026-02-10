// pages/blog/[slug].js
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient' // relative import to project root

/**
 * Page expects a `post` prop:
 * { id, title, content, likes, ... }
 *
 * This file only contains client-side logic (read counting + like UI).
 * It calls your server endpoint for likes (/api/blog/like) but not for reads.
 */

const fmt = (n) => {
  if (typeof n !== 'number') return '0'
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`
  return String(n)
}

export default function BlogPostPage({ post }) {
  const counted = useRef(false)           // ensure read counted only once per mount
  const [likes, setLikes] = useState(post?.likes ?? 0)
  const [liked, setLiked] = useState(false)
  const [checkingLiked, setCheckingLiked] = useState(true)
  const [likeNotice, setLikeNotice] = useState('')
  const noticeTimerRef = useRef(null)

  /* --- Count read (only once per mount when post.id available) --- */
  useEffect(() => {
    if (!post?.id || counted.current) return
    counted.current = true

    // set a session key so same browser session doesn't re-insert
    try {
      const sessKey = `read_post_${post.id}`
      if (typeof window !== 'undefined' && !sessionStorage.getItem(sessKey)) {
        sessionStorage.setItem(sessKey, '1')
      } else {
        // already counted in this session
      }
    } catch (e) {
      // ignore session errors
    }

    // get current user (if any) then attempt to insert a blog_reads row
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user ?? null

        // If user exists: attempt idempotent insert (check existing then insert)
        if (user) {
          try {
            const { data: existingRead, error: readErr } = await supabase
              .from('blog_reads')
              .select('id')
              .eq('post_id', post.id)
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle()

            if (!readErr && !existingRead) {
              // insert read; trigger will increment blog_posts.reads
              const { error: insertErr } = await supabase
                .from('blog_reads')
                .insert([{ post_id: post.id, user_id: user.id }])
              if (!insertErr) {
                // reflect locally
                setLikes((s) => s) // no-op to avoid linter warning
              }
            }
          } catch (e) {
            console.debug('failed to record auth user read', e)
          }
        } else {
          // Unauthenticated: try CLIENT-side insert with user_id = null.
          // This will work only if your DB allows anon inserts into blog_reads.
          try {
            const { data: inserted, error: insertErr } = await supabase
              .from('blog_reads')
              .insert([{ post_id: post.id, user_id: null }])
              .select()
            if (!insertErr && Array.isArray(inserted) && inserted.length > 0) {
              // optionally update UI reads if you want immediate feedback
              // (we don't have reads state here, page-level shows reads from post prop)
            } else {
              // insertErr likely means RLS prevented the insert — it's okay to ignore
              if (insertErr) console.debug('anonymous read insert error (maybe RLS):', insertErr)
            }
          } catch (e) {
            console.debug('anonymous read insert exception (maybe RLS):', e)
          }
        }
      } catch (e) {
        // fallback: ignore
      }
    })()
  }, [post?.id])

  /* --- Check if current user already liked this post --- */
  useEffect(() => {
    if (!post?.id) return
    let mounted = true
    setCheckingLiked(true)

    supabase.auth.getUser()
      .then(({ data }) => {
        const user = data?.user
        if (!user) {
          if (mounted) {
            setLiked(false)
            setCheckingLiked(false)
          }
          return
        }

        // Try to read the single blog_likes row for this user+post.
        supabase
          .from('blog_likes')
          .select('post_id', { count: null }) // minimal select
          .eq('post_id', post.id)
          .eq('user_id', user.id)
          .limit(1)
          .then(({ data, error }) => {
            if (!mounted) return
            if (error) {
              console.warn('error checking like', error)
              setLiked(false)
            } else {
              setLiked(Array.isArray(data) ? data.length > 0 : !!data) // adapt to return shape
            }
            setCheckingLiked(false)
          })
          .catch((e) => {
            console.warn('error checking like', e)
            if (mounted) {
              setLiked(false)
              setCheckingLiked(false)
            }
          })
      })
      .catch(() => {
        if (mounted) {
          setLiked(false)
          setCheckingLiked(false)
        }
      })

    return () => { mounted = false }
  }, [post?.id])

  /* --- Handle like click --- */
  async function handleLikeClick() {
    // get user
    const { data } = await supabase.auth.getUser()
    const user = data?.user

    if (!user) {
      setLikeNotice('Please log in to like this post.')
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = setTimeout(() => {
        setLikeNotice('')
        noticeTimerRef.current = null
      }, 3000)
      return
    }
    setLikeNotice('')

    try {
      const res = await fetch('/api/blog/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, user_id: user.id })
      })
      const j = await res.json()

      if (j.liked) {
        // DB inserted new like — update UI
        setLikes((s) => s + 1)
        setLiked(true)
      } else {
        // Already liked — reflect that in UI (do NOT increment)
        setLiked(true)
      }
    } catch (e) {
      console.error('like error', e)
      alert('Failed to like post. Try again.')
    }
  }

  return (
    <article className="post-container" style={{ padding: 20 }}>
      <h1 style={{ marginBottom: 8 }}>{post?.title}</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={handleLikeClick}
          className={`like-btn ${liked ? 'liked' : ''}`}
          aria-pressed={liked}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            border: '1px solid #ccc',
            background: liked ? '#fee' : 'white'
          }}
        >
          {liked ? '♥ Liked' : '♡ Like'} {fmt(likes)}
        </button>

        <div style={{ color: '#666' }}>
          {/* reads are stored server-side — show placeholder if not present on post */}
          {typeof post?.reads === 'number' ? `${fmt(post.reads)} reads` : ''}
        </div>
      </div>

      {!liked && likeNotice ? (
        <div style={{ color: '#b45309', fontSize: 13, marginTop: 6 }}>{likeNotice}</div>
      ) : null}

      <div dangerouslySetInnerHTML={{ __html: post?.content ?? '' }} />
    </article>
  )
}
