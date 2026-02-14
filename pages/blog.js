// pages/blog.js
import Head from 'next/head'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient' // <-- your existing client

/* Utilities */
const uid = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const formatNumber = (n) => {
  if (!n && n !== 0) return '0'
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`
  return String(n)
}
const CATEGORIES = ['All', 'Funny', 'Educational', 'Tech', 'Religious', 'Others']
const DHAKA_TZ = 'Asia/Dhaka'

function formatDateParts(ts) {
  if (!ts) return { date: '', time: '' }
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: DHAKA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return { date, time }
}

function getEditedParts(createdAt, updatedAt) {
  if (!updatedAt) return null
  const u = new Date(updatedAt)
  if (Number.isNaN(u.getTime())) return null
  if (createdAt) {
    const c = new Date(createdAt)
    if (!Number.isNaN(c.getTime()) && u.getTime() <= c.getTime()) return null
  }
  const dt = formatDateParts(u)
  return dt.date ? dt : null
}

export default function BlogPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // data state (DB-backed)
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState({}) // { postId: [..] }
  const [likes, setLikes] = useState({}) // map of postId => true (for current user)
  const [reads, setReads] = useState({}) // local read counts override (merged with post.reads)
  const [likeNoticeByPost, setLikeNoticeByPost] = useState({})
  const likeNoticeTimers = useRef({})

  // comment-related
  const [commentLikes, setCommentLikes] = useState({}) // map commentId => true for current user
  const [commentLikeCounts, setCommentLikeCounts] = useState({}) // map commentId => number
  const [repliesMap, setRepliesMap] = useState({}) // commentId => [reply]
  const [replyOpen, setReplyOpen] = useState({}) // commentId => bool
  const [replyText, setReplyText] = useState({}) // commentId => string
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [editingReplyId, setEditingReplyId] = useState(null)
  const [editReplyText, setEditReplyText] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const shareNoticeTimer = useRef(null)
  const openFromQueryRef = useRef(false)

  // UI state
  const [activeCategory, setActiveCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedPost, setSelectedPost] = useState(null)
  const [isWriteOpen, setIsWriteOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' })
  const [loadingMore, setLoadingMore] = useState(false)

  // EDIT state: holds id when editing an existing post
  const [editingPostId, setEditingPostId] = useState(null)

  // user info
  const [authUser, setAuthUser] = useState(null)
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [userRole, setUserRole] = useState('user')
  const [currentUserAvatar, setCurrentUserAvatar] = useState('')
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('')

  async function fetchProfilesByIds(ids) {
    const list = Array.from(new Set((ids || []).filter(Boolean)))
    if (list.length === 0) return new Map()
    try {
      // prefer RPC if available (works with RLS-friendly public profiles)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_public_profiles', { ids: list })
      if (!rpcErr && Array.isArray(rpcData)) {
        const map = new Map()
        for (const p of rpcData || []) map.set(p.id, p)
        return map
      }
    } catch (e) {
      // fall through to direct select
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', list)
      if (error) return new Map()
      const map = new Map()
      for (const p of data || []) map.set(p.id, p)
      return map
    } catch (e) {
      return new Map()
    }
  }

  /* Hydrate: load auth + posts + meta from DB */
  useEffect(() => {
    let alive = true
    setMounted(true)

    async function init() {
      // 1) get auth user (if logged in)
      try {
        const { data: ud } = await supabase.auth.getUser()
        const user = ud?.user ?? null
        if (user) {
          setAuthUser(user)
          setCurrentUserId(user.id)
          // try to fetch user's profile (users table with role,name) - fallback gracefully
          try {
            const { data: profile, error: profErr } = await supabase
              .from('users')
              .select('id, name, role')
              .eq('id', user.id)
              .limit(1)
              .maybeSingle()
            if (!profErr && profile) {
              setCurrentUserName(profile.name || (user.user_metadata?.full_name ?? user.email ?? ''))
              setUserRole(profile.role || 'user')
              setIsSuperAdmin((profile.role || '').toLowerCase() === 'super_admin')
            } else {
              setCurrentUserName(user.user_metadata?.full_name ?? user.email ?? '')
              setUserRole('user')
              setIsSuperAdmin(false)
            }
          } catch (e) {
            setCurrentUserName(user.user_metadata?.full_name ?? user.email ?? '')
            setUserRole('user')
            setIsSuperAdmin(false)
          }

          // fetch display name + avatar from profiles (for comments/replies)
          try {
            const { data: profRow } = await supabase
              .from('profiles')
              .select('display_name, username, avatar_url')
              .eq('id', user.id)
              .limit(1)
              .maybeSingle()
            if (profRow) {
              setCurrentUserDisplayName(profRow.display_name || profRow.username || '')
              setCurrentUserAvatar(profRow.avatar_url || '')
            } else {
              setCurrentUserDisplayName('')
              setCurrentUserAvatar('')
            }
          } catch (e) {
            setCurrentUserDisplayName('')
            setCurrentUserAvatar('')
          }
        } else {
          setAuthUser(null)
          setCurrentUserName('')
          setCurrentUserId(null)
          setIsSuperAdmin(false)
          setUserRole('user')
          setCurrentUserAvatar('')
          setCurrentUserDisplayName('')
        }
      } catch (e) {
        console.warn('auth check failed', e)
      }

      // 2) load posts and related meta
      await loadPostsAndMeta()
    }

    init()

    return () => { alive = false }
  }, [])

  useEffect(() => {
    return () => {
      if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current)
    }
  }, [])

  useEffect(() => {
    setShareNotice('')
  }, [selectedPost?.id])

  /* keep page from scrolling when modal open */
  useEffect(() => {
    const locked = !!selectedPost || isWriteOpen
    const prev = typeof window !== 'undefined' ? document.body.style.overflow : ''
    if (typeof window !== 'undefined') document.body.style.overflow = locked ? 'hidden' : ''
    return () => { if (typeof window !== 'undefined') document.body.style.overflow = prev }
  }, [selectedPost, isWriteOpen])

  useEffect(() => {
    if (!router.isReady || openFromQueryRef.current) return
    const q = router.query.post
    if (!q || posts.length === 0) return
    const id = Array.isArray(q) ? q[0] : q
    const p = posts.find((x) => String(x.id) === String(id))
    if (p) {
      openFromQueryRef.current = true
      openPost(p)
    }
  }, [router.isReady, router.query.post, posts])

  /* Fetch posts from DB and load comments + likes(for current user) + replies + comment-likes-counts */
  async function loadPostsAndMeta() {
    try {
      // fetch posts
      const { data: postsData, error: postsErr } = await supabase
        .from('blog_posts')
        .select('id, title, excerpt, content, category, tags, thumbnail, reads, likes, created_at, author_id')
        .order('created_at', { ascending: false })

      if (postsErr) {
        console.error('failed to load posts', postsErr)
        setPosts([])
        return
      }
      const postsList = postsData || []

      // fetch authors (users table) in batch
      const authorIds = Array.from(new Set(postsList.map(p => p.author_id).filter(Boolean)))
      let authorMap = new Map()
      if (authorIds.length > 0) {
        const { data: authors } = await supabase.from('users').select('id, name').in('id', authorIds)
        for (const a of authors || []) authorMap.set(a.id, a.name || '')
      }

      // NOTE: don't try to aggregate blog_likes/blog_reads here with anon client (RLS may hide rows).
      // Use the canonical counters from blog_posts (reads, likes) and treat them as authoritative.
      const normalized = postsList.map(p => ({
        id: p.id,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        category: p.category,
        tags: p.tags || [],
        thumbnail: p.thumbnail || '/thumb-placeholder.jpg',
        // use blog_posts.reads / likes as canonical counts
        reads: Number(p.reads ?? 0),
        likes: Number(p.likes ?? 0),
        date: (p.created_at || '').slice(0, 10),         // YYYY-MM-DD
        time: (p.created_at || '').slice(11, 16),        // HH:MM (if ISO)
        date_raw: p.created_at || '',
        author: authorMap.get(p.author_id) || 'Unknown',
        author_id: p.author_id ?? null, // keep author_id for permission checks when editing/deleting
      }))

      setPosts(normalized)

      // fetch comments for these posts
      const postIds = normalized.map(p => p.id)
      if (postIds.length > 0) {
        const { data: allComments } = await supabase
          .from('blog_comments')
          .select('*')
          .in('post_id', postIds)
          .order('created_at', { ascending: false })

        // fetch replies for those posts
        let replies = []
        try {
          const { data: allReplies } = await supabase
            .from('blog_comment_replies')
            .select('*')
            .in('post_id', postIds)
            .order('created_at', { ascending: true })
          replies = allReplies || []
        } catch (e) {
          replies = []
        }

        // build profile map for comment/reply authors
        const userIds = new Set()
        for (const c of allComments || []) {
          const uid = c.user_id || c.author_id || c.userId
          if (uid) userIds.add(uid)
        }
        for (const r of replies || []) {
          const uid = r.user_id || r.author_id || r.userId
          if (uid) userIds.add(uid)
        }
        const profileMap = await fetchProfilesByIds(Array.from(userIds))

        // build comment map per post
        const cMap = {}
        const commentIds = []
        for (const c of allComments || []) {
          const pid = c.post_id
          const uid = c.user_id || c.author_id || c.userId || null
          const prof = uid ? profileMap.get(uid) : null
          const authorName = prof?.display_name || prof?.username || c.author_name || 'Anonymous'
          const avatarUrl = prof?.avatar_url || ''
          commentIds.push(c.id)
          cMap[pid] = cMap[pid] || []
          const dt = formatDateParts(c.created_at)
          const edited = getEditedParts(c.created_at, c.updated_at)
          cMap[pid].push({
            id: c.id,
            author: authorName,
            text: c.text,
            date: dt.date,
            time: dt.time,
            edited,
            user_id: uid,
            avatar_url: avatarUrl,
          })
        }

        // map replies to comment id
        const rMap = {}
        for (const r of replies) {
          const uid = r.user_id || r.author_id || r.userId || null
          const prof = uid ? profileMap.get(uid) : null
          const authorName = prof?.display_name || prof?.username || r.author_name || 'Anonymous'
          const avatarUrl = prof?.avatar_url || ''
          const dt = formatDateParts(r.created_at)
          const edited = getEditedParts(r.created_at, r.updated_at)
          rMap[r.comment_id] = rMap[r.comment_id] || []
          rMap[r.comment_id].push({
            id: r.id,
            author: authorName,
            text: r.text,
            date: dt.date,
            time: dt.time,
            edited,
            user_id: uid,
            avatar_url: avatarUrl,
          })
        }
        setRepliesMap(rMap)

        // fetch all comment likes (rows) to compute counts
        let commentLikeRows = []
        try {
          const { data: likeRows } = await supabase
            .from('blog_comment_likes')
            .select('id, comment_id, user_id')
            .in('comment_id', commentIds || [])
          commentLikeRows = likeRows || []
        } catch (e) {
          commentLikeRows = []
        }

        const likeCounts = {}
        for (const lr of commentLikeRows) likeCounts[lr.comment_id] = (likeCounts[lr.comment_id] || 0) + 1
        setCommentLikeCounts(likeCounts)

        // fetch likes by current user for comments
        const user = (await supabase.auth.getUser()).data?.user ?? null
        if (user && commentIds.length > 0) {
          try {
            const { data: myCommentLikes } = await supabase
              .from('blog_comment_likes')
              .select('comment_id')
              .eq('user_id', user.id)
              .in('comment_id', commentIds)
            const m = {}
            for (const ml of myCommentLikes || []) m[ml.comment_id] = true
            setCommentLikes(m)
          } catch (e) {
            setCommentLikes({})
          }
        } else {
          setCommentLikes({})
        }

        setComments(cMap)
      } else {
        setComments({})
        setRepliesMap({})
        setCommentLikeCounts({})
        setCommentLikes({})
      }

      // fetch likes for current user (post likes) — allowed by RLS if user owns rows
      const user = (await supabase.auth.getUser()).data?.user ?? null
      if (user && postIds.length > 0) {
        try {
          const { data: userLikes } = await supabase
            .from('blog_likes')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds)
          const map = {}
          for (const l of userLikes || []) map[l.post_id] = true
          setLikes(map)
        } catch (e) {
          setLikes({})
        }
      } else {
        setLikes({})
      }

      // reads mapping (expose canonical reads to UI)
      const rMap = {}
      for (const p of normalized) rMap[p.id] = p.reads
      setReads(rMap)
    } catch (e) {
      console.error('loadPostsAndMeta error', e)
    }
  }

  /* Derived: show posts by category & query (show all authors) */
  const filtered = useMemo(() => {
    if (!mounted) return []
    const q = query.trim().toLowerCase()
    return posts.filter((p) => {
      if (activeCategory !== 'All' && p.category !== activeCategory) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.tags || []).join(' ').toLowerCase().includes(q)
      )
    })
  }, [posts, activeCategory, query, mounted])

  /* Actions */

  // publish: insert into DB (requires auth + super_admin) OR update if editingPostId set
  async function publishDraft() {
    if (!mounted) return
    if (!authUser) {
      alert('Please log in to publish posts.')
      return
    }
    if (!isSuperAdmin) {
      alert('Only Kamonasish can publish posts.')
      return
    }

    const title = (draft.title || '').trim()
    if (!title) return alert('Please add a title.')
    const excerpt = (draft.excerpt || '').trim() || (draft.content || '').slice(0, 140) + '...'
    const tags = (draft.tags || '').split(',').map(t => t.trim()).filter(Boolean)

    try {
      const payload = {
        title,
        excerpt,
        content: draft.content || '',
        category: draft.category || 'Others',
        tags,
        thumbnail: draft.thumbnail || '/thumb-placeholder.jpg',
        author_id: currentUserId,
      }

      if (editingPostId) {
        // UPDATE existing post
        const { data: updated, error: updateErr } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', editingPostId)
          .select()
          .single()

        if (updateErr) {
          console.error('update failed', updateErr)
          return alert('Failed to update post.')
        }

        const updatedPost = {
          id: updated.id,
          title: updated.title,
          excerpt: updated.excerpt,
          content: updated.content,
          category: updated.category,
          tags: updated.tags || [],
          thumbnail: updated.thumbnail || '/thumb-placeholder.jpg',
          reads: Number(updated.reads ?? 0),
          likes: Number(updated.likes ?? 0),
          date: (updated.created_at || '').slice(0, 10),
          time: (updated.created_at || '').slice(11, 16),
          author: currentUserName || 'superadmin',
          author_id: updated.author_id ?? currentUserId,
        }

        setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
        setDraft({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' })
        setIsWriteOpen(false)
        setEditingPostId(null)
        openPost(updatedPost)
        return
      }

      // INSERT new post
      const { data: inserted, error: insertErr } = await supabase
        .from('blog_posts')
        .insert([payload])
        .select()
        .single()

      if (insertErr) {
        console.error('publish failed', insertErr)
        return alert('Failed to publish post.')
      }

      const newPost = {
        id: inserted.id,
        title: inserted.title,
        excerpt: inserted.excerpt,
        content: inserted.content,
        category: inserted.category,
        tags: inserted.tags || [],
        thumbnail: inserted.thumbnail || '/thumb-placeholder.jpg',
        reads: Number(inserted.reads ?? 0),
        likes: Number(inserted.likes ?? 0),
        date: (inserted.created_at || '').slice(0, 10),
        time: (inserted.created_at || '').slice(11, 16),
        author: currentUserName || 'superadmin',
        author_id: inserted.author_id ?? currentUserId,
      }

      setPosts(prev => [newPost, ...prev])
      setDraft({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' })
      setIsWriteOpen(false)
      openPost(newPost)
    } catch (e) {
      console.error('publishDraft unexpected', e)
      alert('Unexpected error while publishing.')
    }
  }

  // open post: show modal, fetch latest comments for that post, record a read
  async function openPost(post) {
    if (!mounted) return
    setSelectedPost(post)

    // --- CHANGED: increment read count on every click (optimistic UI) ---
    setReads(prev => ({ ...prev, [post.id]: (prev[post.id] ?? post.reads ?? 0) + 1 }))
    setPosts(ps => ps.map(x => x.id === post.id ? { ...x, reads: (x.reads ?? 0) + 1 } : x))

    // Call server endpoint to record the read (best-effort). Works for auth and anonymous users.
    try {
      const user = (await supabase.auth.getUser()).data?.user ?? null
      await fetch('/api/blog/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, user_id: user?.id ?? null })
      }).catch(() => null)
      // intentionally non-blocking; server may dedupe or update counts via triggers
    } catch (e) {
      console.debug('call to /api/blog/read failed', e)
    }

    // fetch latest comments and their replies for that post (same as before)
    try {
      const { data: postComments } = await supabase
        .from('blog_comments')
        .select('*')
        .eq('post_id', post.id)
        .order('created_at', { ascending: false })

      const commentRows = postComments || []

      // fetch replies for this post and map per comment
      let replies = []
      try {
        const { data: postReplies } = await supabase
          .from('blog_comment_replies')
          .select('*')
          .eq('post_id', post.id)
          .order('created_at', { ascending: true })
        replies = postReplies || []
      } catch (e) {
        replies = []
      }

      // build profile map for comment/reply authors (this post only)
      const userIds = new Set()
      for (const c of commentRows || []) {
        const uid = c.user_id || c.author_id || c.userId
        if (uid) userIds.add(uid)
      }
      for (const r of replies || []) {
        const uid = r.user_id || r.author_id || r.userId
        if (uid) userIds.add(uid)
      }
      const profileMap = await fetchProfilesByIds(Array.from(userIds))

      // map post comments
      setComments(prev => ({
        ...prev,
        [post.id]: commentRows.map(c => {
          const uid = c.user_id || c.author_id || c.userId || null
          const prof = uid ? profileMap.get(uid) : null
          const authorName = prof?.display_name || prof?.username || c.author_name || 'Anonymous'
          const avatarUrl = prof?.avatar_url || ''
          const dt = formatDateParts(c.created_at)
          const edited = getEditedParts(c.created_at, c.updated_at)
          return {
            id: c.id,
            author: authorName,
            text: c.text,
            date: dt.date,
            time: dt.time,
            edited,
            user_id: uid,
            avatar_url: avatarUrl,
          }
        })
      }))

      // --- FIX: build a fresh replies map for this post and merge (overwrite keys) ---
      const rMap = {}
      for (const r of replies) {
        const uid = r.user_id || r.author_id || r.userId || null
        const prof = uid ? profileMap.get(uid) : null
        const authorName = prof?.display_name || prof?.username || r.author_name || 'Anonymous'
        const avatarUrl = prof?.avatar_url || ''
        const dt = formatDateParts(r.created_at)
        const edited = getEditedParts(r.created_at, r.updated_at)
        rMap[r.comment_id] = rMap[r.comment_id] || []
        rMap[r.comment_id].push({
          id: r.id,
          author: authorName,
          text: r.text,
          date: dt.date,
          time: dt.time,
          edited,
          user_id: uid,
          avatar_url: avatarUrl,
        })
      }
      // merge but overwrite keys for this post's comments (prevents duplicates on repeated open)
      setRepliesMap(prev => ({ ...prev, ...rMap }))

      // fetch comment likes counts and current user's likes for these comments
      const commentIds = commentRows.map(c => c.id)
      if (commentIds.length > 0) {
        let commentLikeRows = []
        try {
          const { data: likeRows } = await supabase
            .from('blog_comment_likes')
            .select('id, comment_id, user_id')
            .in('comment_id', commentIds || [])
          commentLikeRows = likeRows || []
        } catch (e) {
          commentLikeRows = []
        }
        const likeCounts = {}
        for (const lr of commentLikeRows) likeCounts[lr.comment_id] = (likeCounts[lr.comment_id] || 0) + 1
        setCommentLikeCounts(prev => ({ ...prev, ...likeCounts }))

        const user = (await supabase.auth.getUser()).data?.user ?? null
        if (user) {
          try {
            const { data: myCommentLikes } = await supabase
              .from('blog_comment_likes')
              .select('comment_id')
              .eq('user_id', user.id)
              .in('comment_id', commentIds)
            const m = {}
            for (const ml of myCommentLikes || []) m[ml.comment_id] = true
            setCommentLikes(prev => ({ ...prev, ...m }))
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (e) {
      console.warn('fetch post comments failed', e)
    }
  }

  // one-shot like (use server endpoint to avoid RLS/sync issues). Updates UI only after server confirms.
  async function likePostOnce(postId) {
    const user = (await supabase.auth.getUser()).data?.user ?? null
    if (!user) {
      return alert('Please log in to like posts.')
    }

    // Guard client-side: if we already know user liked in this session, short-circuit
    if (likes[postId]) {
      return alert('You already liked this post.')
    }

    try {
      // Call server endpoint that performs safe insert + increments
      const res = await fetch('/api/blog/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, user_id: user.id })
      })
      const j = await res.json().catch(() => ({}))

      if (j && j.liked) {
        // update UI AFTER DB confirms
        setLikes(prev => ({ ...prev, [postId]: true }))
        setPosts(ps => ps.map(p => p.id === postId ? { ...p, likes: (p.likes || 0) + 1 } : p))
        // sync selectedPost if open
        setSelectedPost(prev => (prev && prev.id === postId ? { ...prev, likes: (prev.likes || 0) + 1 } : prev))
      } else {
        // treat as already liked
        return alert('You already liked this post.')
      }
    } catch (e) {
      console.error('like failed', e)
      alert('Failed to like post.')
    }
  }

  // wrapper for clicks - prompts login for visitors
  function handleLikeClick(postId) {
    if (!authUser) {
      // show inline notice instead of redirecting to OAuth
      setLikeNoticeByPost(prev => ({ ...prev, [postId]: 'Please log in to like this post.' }))
      if (likeNoticeTimers.current[postId]) clearTimeout(likeNoticeTimers.current[postId])
      likeNoticeTimers.current[postId] = setTimeout(() => {
        setLikeNoticeByPost(prev => {
          const next = { ...prev }
          delete next[postId]
          return next
        })
        delete likeNoticeTimers.current[postId]
      }, 3000)
      return
    }
    likePostOnce(postId)
  }

  // comment like: one-shot (no deletes) — keep existing optimistic behavior but rollback if error
  async function commentLikeOnce(commentId) {
    const user = (await supabase.auth.getUser()).data?.user ?? null
    if (!user) {
      return alert('Please log in to like comments.')
    }
    if (commentLikes[commentId]) {
      return alert('You already liked this comment.')
    }

    // optimistic update
    setCommentLikes(prev => ({ ...prev, [commentId]: true }))
    setCommentLikeCounts(prev => ({ ...prev, [commentId]: (prev[commentId] || 0) + 1 }))

    try {
      const { error } = await supabase.from('blog_comment_likes').insert([{ comment_id: commentId, user_id: user.id }])
      if (error) {
        console.warn('comment like insert error', error)
        // rollback
        setCommentLikes(prev => { const n = {...prev}; delete n[commentId]; return n })
        setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 1) - 1) }))
        return alert('Failed to like comment.')
      }
    } catch (e) {
      console.warn('comment like write failed', e)
      setCommentLikes(prev => { const n = {...prev}; delete n[commentId]; return n })
      setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 1) - 1) }))
      alert('Failed to like comment.')
    }
  }

  function commentLikeHandler(commentId) {
    if (!authUser) {
      return alert('Please log in to like comments.')
    }
    commentLikeOnce(commentId)
  }

  function getShareUrl(post) {
    if (!post) return ''
    const origin = (typeof window !== 'undefined' && window.location?.origin) || process.env.NEXT_PUBLIC_SITE_URL || ''
    if (!origin) return ''
    return `${origin}/blog?post=${encodeURIComponent(post.id)}`
  }

  function getSharePreviewUrl(post) {
    if (!post) return ''
    const origin = (typeof window !== 'undefined' && window.location?.origin) || process.env.NEXT_PUBLIC_SITE_URL || ''
    if (!origin) return ''
    return `${origin}/blog/share/${encodeURIComponent(post.id)}`
  }

  function notifyShare(msg) {
    setShareNotice(msg)
    if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current)
    shareNoticeTimer.current = setTimeout(() => setShareNotice(''), 2000)
  }

  async function copyShareUrl(post) {
    const url = getShareUrl(post)
    if (!url) return alert('Share link unavailable.')
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        notifyShare('Link copied!')
        return
      }
    } catch (e) {
      // fall through to legacy copy
    }
    try {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      notifyShare('Link copied!')
    } catch (e) {
      alert('Failed to copy link.')
    }
  }

  function shareOnFacebook(post) {
    const url = getSharePreviewUrl(post)
    if (!url) return alert('Share link unavailable.')
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
    window.open(fbUrl, '_blank', 'noopener,noreferrer')
  }

  function startEditComment(comment) {
    setEditingReplyId(null)
    setEditReplyText('')
    setEditingCommentId(comment.id)
    setEditCommentText(comment.text || '')
  }

  function cancelEditComment() {
    setEditingCommentId(null)
    setEditCommentText('')
  }

  async function saveCommentEdit(commentId) {
    if (!authUser) {
      return alert('Please log in to edit comments.')
    }
    const nextText = (editCommentText || '').trim()
    if (!nextText) return alert('Comment cannot be empty.')
    try {
      let updatedAt = null
      const res1 = await supabase
        .from('blog_comments')
        .update({ text: nextText, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select('id, updated_at')
        .single()
      if (res1.error) {
        const msg = String(res1.error.message || '').toLowerCase()
        if (msg.includes('updated_at') || msg.includes('column')) {
          const res2 = await supabase
            .from('blog_comments')
            .update({ text: nextText })
            .eq('id', commentId)
            .select('id')
            .single()
          if (res2.error) {
            console.warn('comment update error', res2.error)
            return alert('Failed to update comment.')
          }
          updatedAt = new Date().toISOString()
        } else {
          console.warn('comment update error', res1.error)
          return alert('Failed to update comment.')
        }
      } else {
        updatedAt = res1.data?.updated_at || new Date().toISOString()
      }
      const edited = getEditedParts(null, updatedAt)
      setComments(prev => {
        const list = prev[selectedPost?.id] || []
        return {
          ...prev,
          [selectedPost?.id]: list.map(c => (c.id === commentId ? { ...c, text: nextText, edited } : c)),
        }
      })
      cancelEditComment()
    } catch (e) {
      console.warn('comment update failed', e)
      alert('Failed to update comment.')
    }
  }

  function startEditReply(reply) {
    setEditingCommentId(null)
    setEditCommentText('')
    setEditingReplyId(reply.id)
    setEditReplyText(reply.text || '')
  }

  function cancelEditReply() {
    setEditingReplyId(null)
    setEditReplyText('')
  }

  async function saveReplyEdit(replyId) {
    if (!authUser) {
      return alert('Please log in to edit replies.')
    }
    const nextText = (editReplyText || '').trim()
    if (!nextText) return alert('Reply cannot be empty.')
    try {
      let updatedAt = null
      const res1 = await supabase
        .from('blog_comment_replies')
        .update({ text: nextText, updated_at: new Date().toISOString() })
        .eq('id', replyId)
        .select('id, updated_at')
        .single()
      if (res1.error) {
        const msg = String(res1.error.message || '').toLowerCase()
        if (msg.includes('updated_at') || msg.includes('column')) {
          const res2 = await supabase
            .from('blog_comment_replies')
            .update({ text: nextText })
            .eq('id', replyId)
            .select('id')
            .single()
          if (res2.error) {
            console.warn('reply update error', res2.error)
            return alert('Failed to update reply.')
          }
          updatedAt = new Date().toISOString()
        } else {
          console.warn('reply update error', res1.error)
          return alert('Failed to update reply.')
        }
      } else {
        updatedAt = res1.data?.updated_at || new Date().toISOString()
      }
      const edited = getEditedParts(null, updatedAt)
      setRepliesMap(prev => {
        const next = {}
        for (const key of Object.keys(prev || {})) {
          next[key] = (prev[key] || []).map(r => (r.id === replyId ? { ...r, text: nextText, edited } : r))
        }
        return next
      })
      cancelEditReply()
    } catch (e) {
      console.warn('reply update failed', e)
      alert('Failed to update reply.')
    }
  }

  // top-level comment add (only logged-in)
  async function addComment(postId, author, text) {
    if (!text || !text.trim()) return
    const user = (await supabase.auth.getUser()).data?.user ?? null
    if (!user) {
      alert('Please log in to comment.')
      return
    }
    try {
      const displayName = author || currentUserDisplayName || currentUserName || user.email || 'Anonymous'
      const payload = { post_id: postId, author_name: displayName, text: text.trim(), user_id: user.id }
      let inserted = null
      let insertErr = null
      const res1 = await supabase
        .from('blog_comments')
        .insert([payload])
        .select()
        .single()
      inserted = res1.data
      insertErr = res1.error
      if (insertErr && String(insertErr.message || '').toLowerCase().includes('column') && String(insertErr.message || '').toLowerCase().includes('user_id')) {
        const res2 = await supabase
          .from('blog_comments')
          .insert([{ post_id: postId, author_name: displayName, text: text.trim() }])
          .select()
          .single()
        inserted = res2.data
        insertErr = res2.error
      }
      if (insertErr) {
        console.error('comment insert failed', insertErr)
        const dt = formatDateParts(new Date())
        const newComment = {
          id: uid('c_'),
          author: displayName,
          text: text.trim(),
          date: dt.date,
          time: dt.time,
          edited: null,
          user_id: user.id,
          avatar_url: currentUserAvatar || '',
        }
        setComments(prev => ({ ...prev, [postId]: [newComment, ...(prev[postId] || [])] }))
        return
      }
      const createdAt = inserted?.created_at || new Date()
      const dt = formatDateParts(createdAt)
      const edited = getEditedParts(createdAt, inserted?.updated_at)
      const newComment = {
        id: inserted.id,
        author: inserted.author_name || displayName || 'Anonymous',
        text: inserted.text,
        date: dt.date,
        time: dt.time,
        edited,
        user_id: inserted.user_id || user.id,
        avatar_url: currentUserAvatar || '',
      }
      setComments(prev => ({ ...prev, [postId]: [newComment, ...(prev[postId] || [])] }))
      // ensure like count map for this new comment
      setCommentLikeCounts(prev => ({ ...prev, [newComment.id]: 0 }))
    } catch (e) {
      console.error('addComment error', e)
    }
  }

  // add reply to a comment (requires login)
  async function addReply(commentId) {
    const text = (replyText[commentId] || '').trim()
    if (!text) return
    const user = (await supabase.auth.getUser()).data?.user ?? null
    if (!user) {
      alert('Please log in to reply.')
      return
    }
    try {
      const displayName = currentUserDisplayName || currentUserName || user.email || 'Anonymous'
      const payload = {
        comment_id: commentId,
        post_id: selectedPost.id,
        author_name: displayName,
        text,
        user_id: user.id,
      }
      let inserted = null
      let insertErr = null
      const res1 = await supabase
        .from('blog_comment_replies')
        .insert([payload])
        .select()
        .single()
      inserted = res1.data
      insertErr = res1.error
      if (insertErr && String(insertErr.message || '').toLowerCase().includes('column') && String(insertErr.message || '').toLowerCase().includes('user_id')) {
        const res2 = await supabase
          .from('blog_comment_replies')
          .insert([{
            comment_id: commentId,
            post_id: selectedPost.id,
            author_name: displayName,
            text,
          }])
          .select()
          .single()
        inserted = res2.data
        insertErr = res2.error
      }
      if (insertErr) {
        console.error('reply insert failed', insertErr)
        const dt = formatDateParts(new Date())
        const newReply = {
          id: uid('r_'),
          author: displayName,
          text: text,
          date: dt.date,
          time: dt.time,
          edited: null,
          user_id: user.id,
          avatar_url: currentUserAvatar || '',
        }
        setRepliesMap(prev => ({ ...prev, [commentId]: [...(prev[commentId] || []), newReply] }))
        setReplyText(prev => ({ ...prev, [commentId]: '' }))
        setReplyOpen(prev => ({ ...prev, [commentId]: false }))
        return
      }
      const createdAt = inserted?.created_at || new Date()
      const dt = formatDateParts(createdAt)
      const edited = getEditedParts(createdAt, inserted?.updated_at)
      const newReply = {
        id: inserted.id,
        author: inserted.author_name || displayName || 'Anonymous',
        text: inserted.text,
        date: dt.date,
        time: dt.time,
        edited,
        user_id: inserted.user_id || user.id,
        avatar_url: currentUserAvatar || '',
      }
      setRepliesMap(prev => ({ ...prev, [commentId]: [...(prev[commentId] || []), newReply] }))
      setReplyText(prev => ({ ...prev, [commentId]: '' }))
      setReplyOpen(prev => ({ ...prev, [commentId]: false }))
    } catch (e) {
      console.error('addReply error', e)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    await new Promise(r => setTimeout(r, 600))
    setLoadingMore(false)
  }

  /* New: Open edit modal for a specific post (pre-fill draft) */
  function openEdit(post) {
    // permission check: superadmin OR post.author_id === currentUserId
    const allowed = isSuperAdmin || (currentUserId && post.author_id && currentUserId === post.author_id)
    if (!allowed) return alert('You are not allowed to edit this post.')

    // set draft values (tags back to comma string)
    setDraft({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category || 'Educational',
      tags: Array.isArray(post.tags) ? (post.tags || []).join(', ') : (post.tags || ''),
      thumbnail: post.thumbnail || ''
    })
    setEditingPostId(post.id)
    setIsWriteOpen(true)
  }

  /* New: Delete a post (confirm + delete from db + update UI) */
  async function deletePost(post) {
    // permission check
    const allowed = isSuperAdmin || (currentUserId && post.author_id && currentUserId === post.author_id)
    if (!allowed) return alert('You are not allowed to delete this post.')

    if (!confirm('Delete this post? This action cannot be undone.')) return

    try {
      const { error } = await supabase.from('blog_posts').delete().eq('id', post.id)
      if (error) {
        console.error('delete failed', error)
        return alert('Failed to delete post.')
      }
      // remove locally
      setPosts(prev => prev.filter(p => p.id !== post.id))
      // close modal if viewing the same post
      if (selectedPost && selectedPost.id === post.id) setSelectedPost(null)
      // also clear editing state if we were editing it
      if (editingPostId === post.id) {
        setEditingPostId(null)
        setIsWriteOpen(false)
        setDraft({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' })
      }
    } catch (e) {
      console.error('deletePost unexpected', e)
      alert('Unexpected error while deleting.')
    }
  }

  /* Render (UI unchanged semantically, but post modal & comment UI improved) */
  return (
    <>
      <Head>
        <title>{mounted && currentUserName ? `${currentUserName} — Blog` : 'Blog'}</title>
        <meta name="description" content="Your posts. Only Kamonasish can write. Auth users can comment." />
      </Head>

      <main className="page-root">
        <header className="topbar">
          <div className="brand">Kamonasish</div>

          <div className="search-wrap">
            <input
              aria-label="Search posts"
              className="search"
              placeholder="Search posts, tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="actions">
            {mounted && isSuperAdmin ? (
              <button className="btn btn-outline" onClick={() => { setIsWriteOpen(true); setEditingPostId(null); setDraft({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' }) }}>Write a Post</button>
            ) : (
              <button className="btn btn-outline" onClick={() => {
                if (!mounted || !authUser) return alert('Only Kamonasish can write posts. Please log in.')
                alert('Only Kamonasish can write posts.')
              }}>Write a Post</button>
            )}
          </div>
        </header>

        <section className="container">
          <aside className="sidebar" aria-label="Categories">
            <div className="categories">
              {CATEGORIES.map(c => (
                <button key={c} className={`cat-pill ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)} aria-pressed={activeCategory === c}>
                  {c}
                </button>
              ))}
            </div>

            <div className="sidebar-card">
              <h5>About</h5>
              <p className="muted">
                The internet has enough noise. This blog tries to be signal — with a sense of humor.
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                Here, Kamonasish Roy shares posts ranging from educational ideas to funny observations and everything in between. Readers aren’t just spectators; logged-in users can comment, reply, and be part of the conversation.
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                It’s not about perfection. It’s about consistency, curiosity, and community.
              </p>
            </div>
          </aside>

          <main className="content" aria-live="polite">
            <div className="content-header">
              <h1 className="page-title">Posts</h1>
              <div className="meta">
                <span className="muted">{mounted ? filtered.length : 0} posts</span>
              </div>
            </div>

            <div className="posts-grid" role="list">
              {mounted && filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--muted-2)' }}>
                  No posts found. {isSuperAdmin ? 'Create one with "Write a Post".' : 'No posts yet.'}
                </div>
              )}

              {mounted && filtered.map(p => {
                const liked = !!likes[p.id]
                const readCount = reads[p.id] ?? p.reads
                const postComments = comments[p.id] ?? p.comments ?? []
                // can current user edit/delete?
                const canManage = isSuperAdmin || (currentUserId && p.author_id && currentUserId === p.author_id)
                return (
                  <article key={p.id} className="post-card" role="listitem">
                    <div className="thumb" aria-hidden="true" style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url(${p.thumbnail})` }} />
                    <div className="post-body">
                      <div className="post-meta">
                        <span className="category">{p.category}</span>
                        <span className="date muted">{p.date}{p.time ? ` • ${p.time}` : ''}</span>
                      </div>

                      <h3 className="post-title">{p.title}</h3>
                      <p className="excerpt muted">{p.excerpt}</p>

                      <div className="post-footer">
                        <div className="engage">
                          <button
                            className={`like-btn ${liked ? 'liked' : ''}`}
                            onClick={() => handleLikeClick(p.id)}
                            aria-pressed={liked}
                            aria-disabled={!authUser}
                            title={!authUser ? 'Log in to like' : (liked ? 'You liked this' : 'Like')}
                            style={{ cursor: authUser ? 'pointer' : 'not-allowed' }}
                          >
                            <svg className="heart" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                              <path d="M12 21s-7-4.35-9-7.5C-0.5 9.5 4 4 7.5 6.5 9.2 7.8 12 10 12 10s2.8-2.2 4.5-3.5C20 4 24.5 9.5 21 13.5 19 16.65 12 21 12 21z" />
                            </svg>
                            <span className="count">{formatNumber(p.likes || 0)}</span>
                          </button>
                          {!liked && likeNoticeByPost[p.id] ? (
                            <span style={{ color: '#b45309', fontSize: 12 }}>
                              {likeNoticeByPost[p.id]}
                            </span>
                          ) : null}

                          {/* <-- replaced markup per your snippet so it shows "X Reads" and "Y Comments" */}
                          <div className="stat" title="Reads">
                            <svg className="icon" viewBox="0 0 24 24">
                              <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" />
                            </svg>
                            <span>{readCount} Reads</span>
                          </div>

                          <div className="stat" title="Comments">
                            <svg className="icon" viewBox="0 0 24 24">
                              <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>{postComments.length} Comments</span>
                          </div>
                        </div>

                        <div className="actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn btn-cyan" onClick={() => openPost(p)}>Read more</button>
                          {/* Edit & Delete buttons (visible to superadmin or author) */}
                          {canManage ? (
                            <>
                              <button className="btn btn-outline" onClick={() => openEdit(p)}>Edit</button>
                              <button className="btn" onClick={() => deletePost(p)}>Delete</button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="load-more-wrap">
              <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</button>
            </div>
          </main>
        </section>

        {/* Write Post Modal (superadmin only) */}
        {mounted && isSuperAdmin && isWriteOpen && (
          <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) { setIsWriteOpen(false); setEditingPostId(null); } }} role="dialog" aria-modal="true" aria-label="Write a post">
            <div className="modal-card write">
              <button className="modal-close" onClick={() => { setIsWriteOpen(false); setEditingPostId(null); }} aria-label="Close">✕</button>

              {/* Header with actions */}
              <div className="modal-header">
                <div className="modal-header-left">
                  <h2>{editingPostId ? 'Edit post' : 'Create a new post'}</h2>
                  <div className="muted small">Write something useful — use categories & tags for discoverability</div>
                </div>

                <div className="modal-header-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => { setIsWriteOpen(false); setDraft({ title: '', excerpt: '', content: '', category: 'Educational', tags: '', thumbnail: '' }); setEditingPostId(null); }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={publishDraft}>{editingPostId ? 'Save changes' : 'Publish'}</button>
                </div>
              </div>

              {/* Body (form) */}
              <div className="modal-body">
                <div className="form-grid">
                  <label>Title
                    <input value={draft.title} onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))} />
                  </label>

                  <label>Excerpt
                    <input value={draft.excerpt} onChange={(e) => setDraft(d => ({ ...d, excerpt: e.target.value }))} />
                  </label>

                  <label>Category
                    <select value={draft.category} onChange={(e) => setDraft(d => ({ ...d, category: e.target.value }))}>
                      {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                  <label>Tags (comma separated)
                    <input value={draft.tags} onChange={(e) => setDraft(d => ({ ...d, tags: e.target.value }))} />
                  </label>

                  <label style={{ gridColumn: '1 / -1' }}>Thumbnail URL (optional)
                    <input value={draft.thumbnail} onChange={(e) => setDraft(d => ({ ...d, thumbnail: e.target.value }))} placeholder="/path-or-url.jpg" />
                  </label>

                  <label style={{ gridColumn: '1 / -1' }}>Content
                    <textarea value={draft.content} onChange={(e) => setDraft(d => ({ ...d, content: e.target.value }))} />
                  </label>
                </div>

                {/* small helper row */}
                <div className="write-hint">
                  <small className="muted-2">Tip: Use short excerpt and 2–4 tags. You can edit post later.</small>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Post Modal (improved UI) */}
        {mounted && selectedPost && (
          <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setSelectedPost(null) }} role="dialog" aria-modal="true" aria-label={selectedPost.title}>
            <div className="modal-card post-view">
              <button className="modal-close" onClick={() => setSelectedPost(null)} aria-label="Close">✕</button>

              <div className="modal-thumb" style={{ backgroundImage: `url(${selectedPost.thumbnail})` }} />

              <div className="modal-body post-body-large">
                <h2 className="postview-title">{selectedPost.title}</h2>
                <div className="meta muted">By {selectedPost.author} • {selectedPost.date}{selectedPost.time ? ` • ${selectedPost.time}` : ''} • {selectedPost.category}</div>

                {/* content wrapped in a high-contrast card for readability */}
                <div className="post-content">
                  <article className="content-card">
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedPost.content || 'Full content not provided.'}
                    </div>
                  </article>
                </div>

                <div className="post-actions" style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className={`like-btn ${!!likes[selectedPost.id] ? 'liked' : ''}`}
                    onClick={() => handleLikeClick(selectedPost.id)}
                    aria-pressed={!!likes[selectedPost.id]}
                    aria-disabled={!authUser}
                    title={!authUser ? 'Log in to like' : (!!likes[selectedPost.id] ? 'You liked this' : 'Like')}
                    style={{ cursor: authUser ? 'pointer' : 'not-allowed' }}
                  >
                    <svg className="heart" viewBox="0 0 24 24" fill={!!likes[selectedPost.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                      <path d="M12 21s-7-4.35-9-7.5C-0.5 9.5 4 4 7.5 6.5 9.2 7.8 12 10 12 10s2.8-2.2 4.5-3.5C20 4 24.5 9.5 21 13.5 19 16.65 12 21 12 21z" />
                    </svg>
                    <span style={{ marginLeft: 8 }}>{formatNumber(posts.find(p => p.id === selectedPost.id)?.likes ?? selectedPost.likes ?? 0)}</span>
                  </button>
                  {!likes[selectedPost.id] && likeNoticeByPost[selectedPost.id] ? (
                    <span style={{ color: '#b45309', fontSize: 12 }}>
                      {likeNoticeByPost[selectedPost.id]}
                    </span>
                  ) : null}
                  <div className="reads muted">{formatNumber(reads[selectedPost.id] || selectedPost.reads || 0)} reads</div>
                  <div className="share-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => copyShareUrl(selectedPost)}>Copy Link</button>
                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => shareOnFacebook(selectedPost)} title="Share on Facebook" aria-label="Share on Facebook">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M13.5 9.5V7.2c0-1 .6-1.2 1-1.2h1.9V3h-2.6c-2.4 0-3.3 1.8-3.3 3.1v3.4H8.5v3h2.1V21h3V12.5h2.5l.4-3h-2.9z" />
                      </svg>
                      <span>Share</span>
                    </button>
                    {shareNotice ? <span className="share-note muted-2">{shareNotice}</span> : null}
                  </div>

                  {/* show Edit/Delete inside modal for managers */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {(isSuperAdmin || (currentUserId && selectedPost.author_id && currentUserId === selectedPost.author_id)) ? (
                      <>
                        <button className="btn btn-outline" onClick={() => { openEdit(selectedPost); }}>Edit</button>
                        <button className="btn" onClick={() => deletePost(selectedPost)}>Delete</button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="comments-section">
                  <h4>Comments</h4>

                  {/* top-level comment form: only for logged-in users */}
                  {authUser ? (
                    <CommentFormLogged
                      postId={selectedPost.id}
                      onAdd={(author, text) => addComment(selectedPost.id, author, text)}
                      currentUserName={currentUserDisplayName || currentUserName}
                    />
                  ) : (
                    <p className="muted-2">Please <button className="btn btn-outline" onClick={() => router.push('/login')}>Log in</button> to comment or reply.</p>
                  )}

                  {/* comment list for this post */}
                  <div style={{ marginTop: 12 }}>
                    {(comments[selectedPost.id] || []).length === 0 ? <p className="muted-2">No comments yet — be the first.</p> : null}
                    <div>
                      {(comments[selectedPost.id] || []).map(c => {
                        const canEditComment = authUser && (isSuperAdmin || (currentUserId && c.user_id && currentUserId === c.user_id))
                        return (
                        <div key={c.id} className="comment-item comment-root">
                          <div className="comment-top">
                            <div className="avatar" aria-hidden="true">
                              {c.avatar_url ? (
                                <img src={c.avatar_url} alt="" />
                              ) : (
                                (c.author || 'A').slice(0,1).toUpperCase()
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="meta">
                                <strong style={{ color: '#e6f7ff' }}>{c.author}</strong>
                                {selectedPost?.author_id && c.user_id && selectedPost.author_id === c.user_id ? (
                                  <span className="author-badge">Author</span>
                                ) : null}
                                <span className="muted-2">• {c.date}{c.time ? ` • ${c.time}` : ''}</span>
                                {c.edited ? (
                                  <span className="edited-tag">• Edited</span>
                                ) : null}
                              </div>
                              {editingCommentId === c.id ? (
                                <div className="comment-edit" style={{ marginTop: 6 }}>
                                  <textarea
                                    className="comment-edit-input"
                                    value={editCommentText}
                                    onChange={(e) => setEditCommentText(e.target.value)}
                                    rows={3}
                                  />
                                  <div className="comment-edit-actions">
                                    <button className="btn btn-cyan" onClick={() => saveCommentEdit(c.id)}>Save</button>
                                    <button className="btn btn-outline" onClick={cancelEditComment}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginTop: 6 }}>{c.text}</div>
                              )}

                              <div className="comment-actions" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                                {/* COMMENT LIKE: disabled for visitors, tooltip/title shows "Log in to like" */}
                                <button
                                  className={`btn btn-like ${commentLikes[c.id] ? 'liked' : ''}`}
                                  onClick={() => { if (authUser) commentLikeHandler(c.id) }}
                                  title={!authUser ? 'Log in to like' : (commentLikes[c.id] ? 'You liked this' : 'Like')}
                                  aria-disabled={!authUser}
                                  disabled={!authUser}
                                >
                                  {commentLikes[c.id] ? 'Liked' : 'Like'} {(typeof commentLikeCounts[c.id] !== 'undefined') ? `· ${commentLikeCounts[c.id]}` : ''}
                                </button>

                                {/* REPLY: if not auth, navigate to login; if auth, toggle reply box */}
                                <button
                                  className="btn btn-outline"
                                  onClick={() => {
                                    if (!authUser) {
                                      router.push('/login')
                                    } else {
                                      setReplyOpen(prev => ({ ...prev, [c.id]: !prev[c.id] }))
                                    }
                                  }}
                                  title={!authUser ? 'Log in to reply' : 'Reply'}
                                >
                                  Reply { (repliesMap[c.id] || []).length ? `· ${(repliesMap[c.id] || []).length}` : '' }
                                </button>
                                {canEditComment ? (
                                  <button className="btn btn-outline" onClick={() => startEditComment(c)} title="Edit comment">
                                    Edit
                                  </button>
                                ) : null}
                              </div>

                              {/* replies list */}
                              <div style={{ marginTop: 10, marginLeft: 44 }}>
                                {(repliesMap[c.id] || []).map(r => {
                                  const canEditReply = authUser && (isSuperAdmin || (currentUserId && r.user_id && currentUserId === r.user_id))
                                  return (
                                  <div key={r.id} className="comment-reply" style={{ marginBottom: 8 }}>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                      <div className="avatar avatar-sm" aria-hidden="true">
                                        {r.avatar_url ? (
                                          <img src={r.avatar_url} alt="" />
                                        ) : (
                                          (r.author || 'A').slice(0,1).toUpperCase()
                                        )}
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div className="meta">
                                          <strong style={{ color: '#e6f7ff' }}>{r.author}</strong>
                                          {selectedPost?.author_id && r.user_id && selectedPost.author_id === r.user_id ? (
                                            <span className="author-badge">Author</span>
                                          ) : null}
                                          <span className="muted-2">• {r.date}{r.time ? ` • ${r.time}` : ''}</span>
                                          {r.edited ? (
                                            <span className="edited-tag">• Edited</span>
                                          ) : null}
                                        </div>
                                        {editingReplyId === r.id ? (
                                          <div className="comment-edit" style={{ marginTop: 6 }}>
                                            <input
                                              className="reply-input"
                                              value={editReplyText}
                                              onChange={(e) => setEditReplyText(e.target.value)}
                                            />
                                            <div className="comment-edit-actions">
                                              <button className="btn btn-cyan" onClick={() => saveReplyEdit(r.id)}>Save</button>
                                              <button className="btn btn-outline" onClick={cancelEditReply}>Cancel</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ marginTop: 6 }}>{r.text}</div>
                                        )}
                                        {canEditReply ? (
                                          <div className="reply-actions">
                                            <button className="btn btn-outline" onClick={() => startEditReply(r)} title="Edit reply">
                                              Edit
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                )})}

                                {replyOpen[c.id] && authUser && (
                                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                    <input
                                      className="reply-input"
                                      value={replyText[c.id] || ''}
                                      onChange={(e) => setReplyText(prev => ({ ...prev, [c.id]: e.target.value }))}
                                      placeholder="Write a reply..."
                                    />
                                    <button className="btn btn-cyan" onClick={() => addReply(c.id)}>Reply</button>
                                  </div>
                                )}

                                {replyOpen[c.id] && !authUser && (
                                  <div style={{ marginTop: 8 }}><small className="muted-2">Log in to reply.</small></div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Styles (improved readability for modal content) */}
      <style jsx global>{`
        :root{
          --bg-dark: #0f172a;
          --grid-cyan: rgba(0,210,255,0.03);
          --accent-cyan: #00d2ff;
          --card-bg: rgba(255,255,255,0.04);
          --glass-blur: 8px;
          --muted: rgba(255,255,255,0.78);
          --muted-2: rgba(255,255,255,0.62);
          --glass-border: rgba(255,255,255,0.06);
          --radius: 14px;
          --shadow: 0 10px 30px rgba(2,6,23,0.6);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        }
        html,body,#__next { height: 100%; }
        body { margin: 0; background: var(--bg-dark); color: var(--muted); background-image: linear-gradient(var(--grid-cyan) 1px, transparent 1px), linear-gradient(90deg, var(--grid-cyan) 1px, transparent 1px); background-size: 50px 50px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; line-height: 1.5; }
        .page-root { min-height: 100vh; padding-bottom: 80px; }
        .topbar { max-width: 1100px; margin: 28px auto 18px; display: flex; gap: 16px; align-items: center; padding: 12px; }
        .brand { color: #e6f7ff; font-weight: 800; font-size: 20px; letter-spacing: 0.6px; }
        .search-wrap { flex: 1; }
        .search { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--muted); outline: none; transition: box-shadow .18s ease, transform .18s ease; }
        .search:focus { box-shadow: 0 6px 24px rgba(0,210,255,0.06); transform: translateY(-2px); }
        .actions { display:flex; gap:10px; }
        .container { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 260px 1fr; gap: 22px; padding: 0 18px; }
        .sidebar { position: sticky; top: 24px; align-self: start; }
        .categories { display:flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
        .cat-pill { background: transparent; color: var(--muted); border: 1px solid transparent; padding: 10px 12px; border-radius: 999px; text-align: left; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background-color .18s ease; }
        .cat-pill:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,210,255,0.06); }
        .cat-pill.active { background: linear-gradient(90deg, rgba(0,210,255,0.08), rgba(0,210,255,0.04)); color: #e6f7ff; border: 1px solid rgba(0,210,255,0.18); box-shadow: 0 10px 30px rgba(0,210,255,0.08); }
        .sidebar-card { background: rgba(255,255,255,0.02); border-radius: 12px; padding: 12px; border: 1px solid var(--glass-border); margin-bottom: 12px; }
        .sidebar-card h5 { margin: 0 0 8px 0; color: #e6f7ff; }
        .content { padding: 6px 0 40px; }
        .content-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom: 14px; }
        .page-title { margin: 0; color: #e6f7ff; font-size: 22px; }
        .meta { display:flex; gap:12px; align-items:center; }
        .posts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        .post-card { background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--glass-border); transition: transform .22s cubic-bezier(.2,.9,.2,1), box-shadow .22s ease, border-color .22s ease; will-change: transform, box-shadow; }
        .post-card:hover { transform: translateY(-10px); box-shadow: var(--shadow); border-color: rgba(0,210,255,0.12); }
        .thumb { height: 160px; background-size: cover; background-position: center; }
        .post-body { padding: 14px; display:flex; flex-direction:column; gap:12px; flex:1; }
        .post-meta { display:flex; gap:10px; align-items:center; font-size:13px; }
        .category { background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 999px; color: #dff9ff; font-weight:600; font-size:12px; }
        .date { font-size: 12px; color: var(--muted-2); }
        .post-title { margin: 0; color: #e6f7ff; font-size: 18px; line-height:1.15; }
        .excerpt { margin: 0; color: var(--muted-2); font-size: 14px; }
        .post-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:auto; }
        .engage { display:flex; gap:10px; align-items:center; }
        .like-btn { display:inline-flex; align-items:center; gap:8px; padding:6px 8px; border-radius:10px; border:1px solid rgba(255,255,255,0.03); background: rgba(255,255,255,0.02); color: var(--muted); cursor:pointer; transition: transform .18s ease, background-color .18s ease, color .18s ease; }
        .like-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,210,255,0.06); }
        .like-btn.liked { background: linear-gradient(90deg, rgba(0,210,255,0.12), rgba(0,210,255,0.06)); color: var(--bg-dark); border-color: rgba(0,210,255,0.18); }
        .heart { width:18px; height:18px; display:block; color: currentColor; }
        .count { font-size:13px; }
        .reads, .comments { display:inline-flex; gap:6px; align-items:center; font-size:13px; color: var(--muted-2); }
        .stat { display:inline-flex; gap:8px; align-items:center; font-size:13px; color: var(--muted-2); }
        .stat .icon { width:18px; height:18px; display:block; }
        .actions .btn { padding:8px 12px; border-radius:10px; font-weight:700; text-transform:none; }
        .btn { background: rgba(255,255,255,0.03); color: var(--muted); border: 1px solid rgba(255,255,255,0.04); cursor:pointer; }
        .btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.06); color: var(--muted); padding:8px 12px; border-radius:10px; }
        .btn-cyan { background: rgba(0,210,255,0.06); color: var(--accent-cyan); border: 1px solid rgba(0,210,255,0.12); }
        .btn-cyan:hover { background: rgba(0,210,255,0.14); color: var(--bg-dark); box-shadow: 0 14px 40px rgba(0,210,255,0.12); transform: translateY(-4px) scale(1.02); }
        .load-more-wrap { display:flex; justify-content:center; margin-top:18px; }

        /* --- modal overlay: stronger so page grid won't bleed through --- */
        .modal { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; background: rgba(2,6,23,0.92); z-index: 2000; padding: 24px; }

        /* modal card base: make more opaque so underlying page doesn't show through */
        .modal-card { width: min(980px, 96%); background: rgba(6,10,16,0.98); border-radius: 16px; overflow: hidden; display:flex; flex-direction:column; border: 1px solid rgba(255,255,255,0.04); box-shadow: 0 30px 80px rgba(2,6,23,0.8); }
        .modal-card.write {
          max-width: 900px;
          width: min(900px, 96%);
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
          border: 1px solid rgba(0,210,255,0.10);
          box-shadow: 0 18px 60px rgba(2,6,23,0.7), 0 6px 20px rgba(0,210,255,0.04);
          backdrop-filter: blur(10px) saturate(120%);
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .modal-close { position:absolute; right: 20px; top: 18px; background: rgba(0,0,0,0.35); color: #e6f7ff; border: none; font-size:18px; cursor:pointer; z-index: 80; padding:6px 8px; border-radius:8px; }
        .modal-thumb { height: 220px; background-size: cover; background-position:center; position: relative; }

        /* stronger overlay on top of thumbnail so title/meta remain legible */
        .modal-thumb::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(2,6,23,0.7) 0%, rgba(2,6,23,0.9) 100%);
          pointer-events: none;
        }

        .modal-body { padding: 18px; color: var(--muted); position: relative; }

        /* improved post view: ensure the post-view card itself is opaque */
        .modal-card.post-view {
          max-width: 960px;
          width: min(96%, 960px);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 48px);
          background: rgba(6,10,16,0.98);
          box-shadow: 0 30px 90px rgba(2,6,23,0.85);
        }
        .modal-body.post-body-large {
          padding: 20px;
          overflow: auto;
          /* the parent card is opaque now; child can remain transparent */
          background: transparent;
        }
        .modal-body.post-body-large::-webkit-scrollbar { width: 9px; }
        .modal-body.post-body-large::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.03); border-radius: 999px; }
        .post-view .post-body-large { max-width: 900px; width: 100%; margin: 0 auto; }
        .postview-title { margin: 0; color: #e6f7ff; font-size: 22px; }
        .post-content { color: var(--muted-2); margin-top: 12px; font-size: 15px; }

        /* content card — high contrast, comfortable reading (fully opaque) */
        .content-card {
          background: #04111a; /* solid dark card for highest contrast */
          color: #e6f7ff;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(2,6,23,0.6);
          margin-top: 12px;
          font-size: 17px;
          line-height: 1.9;
        }
        .content-card p, .content-card ul, .content-card ol, .content-card h2, .content-card h3 {
          color: inherit;
          margin: 0 0 12px 0;
        }
        .content-card a { color: var(--accent-cyan); text-decoration: underline; }

        .comments-section { margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 14px; }
        .comments-section h4 { margin: 0 0 8px; color: #e6f7ff; }

        .comment-form { display:flex; gap:8px; margin-bottom:12px; }
        .comment-form input, .comment-form textarea { background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); color: var(--muted); padding:8px; border-radius:8px; outline:none; }
        .comment-form textarea { resize: vertical; min-height:64px; flex:1; }
        .reply-input { flex: 1; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); color: var(--muted); padding:8px; border-radius:8px; outline:none; }

        .comment-item { padding:10px; border-radius:10px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.02); margin-bottom:8px; display:flex; gap:12px; }
        .comment-root { align-items:flex-start; }
        .comment-top { display:flex; gap:12px; width:100%; }
        .comment-item .meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .author-badge { margin-left: 6px; padding:2px 6px; border-radius:999px; background: rgba(0,210,255,0.12); color: var(--accent-cyan); font-size:10px; font-weight:700; text-transform: uppercase; letter-spacing:0.4px; }
        .edited-tag { color: var(--muted-2); font-size:12px; }
        .comment-edit-input { width:100%; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); color: var(--muted); padding:8px; border-radius:8px; outline:none; resize: vertical; }
        .comment-edit-actions { display:flex; gap:8px; margin-top:8px; }
        .reply-actions { margin-top:6px; display:flex; gap:8px; }
        .avatar { width:36px; height:36px; border-radius:50%; background: linear-gradient(90deg, rgba(0,210,255,0.06), rgba(255,255,255,0.01)); display:flex; align-items:center; justify-content:center; color: var(--muted); font-weight:700; overflow:hidden; }

        .share-actions { display:flex; gap:8px; align-items:center; }
        .share-note { font-size:12px; }
        .btn-sm { padding:6px 10px; border-radius:8px; font-size:13px; }
        .btn-icon { display:inline-flex; align-items:center; gap:6px; }
        .btn-icon svg { width:16px; height:16px; fill: currentColor; }
        .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .avatar.avatar-sm { width:28px; height:28px; font-size:12px; }
        .comment-reply { padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.02); margin-bottom: 6px; }
        .comment-actions .btn { padding:6px 10px; border-radius:8px; font-size:13px; }
        .btn-like { background: transparent; border: none; color: var(--muted-2); cursor: pointer; padding: 6px 8px; border-radius: 8px; }
        .btn-like.liked { color: var(--accent-cyan); font-weight:700; }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
        .form-grid label { display:flex; flex-direction:column; gap:8px; color: var(--muted-2); }
        .form-grid input, .form-grid select, .form-grid textarea { padding:8px; border-radius:8px; border:1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--muted); outline:none; }
        .form-grid textarea { min-height: 140px; grid-column: 1 / -1; }

        .write-hint { margin-top: 12px; display:flex; justify-content:space-between; align-items:center; color: var(--muted-2); }

        @media (max-width: 980px) {
          .container { grid-template-columns: 1fr; padding: 0 14px; }
          .posts-grid { grid-template-columns: 1fr; }
          .sidebar { position: relative; top: auto; }
          .form-grid { grid-template-columns: 1fr; }
          .modal-card.write { width: calc(100% - 32px); margin: 0 16px; }
        }

        @media (max-width: 640px) {
          .modal-card.post-view { width: calc(100% - 28px); max-height: calc(100vh - 28px); }
          .modal-thumb { height: 160px; }
          .postview-title { font-size: 18px; }
          .content-card { padding: 16px; font-size: 15px; line-height: 1.8; }
        }
      `}</style>
    </>
  )
}

/* CommentForm for logged-in users (top-level) */
function CommentFormLogged({ postId, onAdd, currentUserName }) {
  const [text, setText] = useState('')
  return (
    <form className="comment-form" onSubmit={(e) => { e.preventDefault(); onAdd(currentUserName, text); setText('') }}>
      <textarea placeholder="Write a comment..." value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button className="btn btn-cyan" type="submit">Post</button>
      </div>
    </form>
  )
}

/* WARNING: old CommentList removed — replaced inline rendering in modal for richer features */
