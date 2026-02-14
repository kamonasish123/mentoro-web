// pages/blog/share/[id].js
import Head from 'next/head'
import { createClient } from '@supabase/supabase-js'
import { useEffect } from 'react'

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function BlogShareRedirect({ meta, target }) {
  useEffect(() => {
    if (target && typeof window !== 'undefined') {
      window.location.replace(target)
    }
  }, [target])

  return (
    <>
      <Head>
        <title>{meta?.title || 'Blog Post'}</title>
        <meta name="description" content={meta?.description || ''} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={meta?.title || ''} />
        <meta property="og:description" content={meta?.description || ''} />
        <meta property="og:image" content={meta?.image || ''} />
        <meta property="og:url" content={meta?.url || ''} />
        <meta property="og:site_name" content="Kamonasish Blog" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta?.title || ''} />
        <meta name="twitter:description" content={meta?.description || ''} />
        <meta name="twitter:image" content={meta?.image || ''} />
      </Head>
      <main style={{ padding: 20, fontFamily: 'sans-serif' }}>
        Redirecting to the post... If nothing happens, <a href={target}>click here</a>.
      </main>
    </>
  )
}

export async function getServerSideProps({ params, req }) {
  const id = params?.id
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey || !id) {
    return { notFound: true }
  }

  const sb = createClient(supabaseUrl, supabaseAnonKey)
  const { data: post, error } = await sb
    .from('blog_posts')
    .select('id, title, excerpt, content, thumbnail')
    .eq('id', id)
    .maybeSingle()

  if (error || !post) {
    return { notFound: true }
  }

  const proto = (req.headers['x-forwarded-proto'] || 'https').toString()
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const origin = host ? `${proto}://${host}` : ''
  const title = post.title || 'Blog Post'
  const rawDesc = (post.excerpt || stripHtml(post.content || '')).trim()
  const description = rawDesc
    ? (rawDesc.length > 180 ? `${rawDesc.slice(0, 177)}...` : rawDesc)
    : `Read "${title}" on Kamonasish Blog.`
  const image = post.thumbnail
    ? (post.thumbnail.startsWith('http') ? post.thumbnail : `${origin}${post.thumbnail}`)
    : `${origin}/avatar.jpg`
  const url = origin ? `${origin}/blog/share/${encodeURIComponent(post.id)}` : ''
  const target = origin ? `${origin}/blog?post=${encodeURIComponent(post.id)}` : `/blog?post=${encodeURIComponent(post.id)}`

  return {
    props: {
      meta: { title, description, image, url },
      target,
    },
  }
}
