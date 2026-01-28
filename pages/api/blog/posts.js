//pages/api/blog/posts.js
import { pool } from '@/lib/db'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { category, author } = req.query

    const values = []
    let where = []

    if (category && category !== 'All') {
      values.push(category)
      where.push(`category = $${values.length}`)
    }
    if (author) {
      values.push(author)
      where.push(`author_id = $${values.length}`)
    }

    const query = `
      SELECT p.*, u.name as author
      FROM blog_posts p
      join users u on u.id = p.author_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
    `

    const { rows } = await pool.query(query, values)
    return res.json(rows)
  }

  if (req.method === 'POST') {
    const { title, excerpt, content, category, tags, thumbnail, author_id, role } = req.body

    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Not allowed' })
    }

    const { rows } = await pool.query(
      `insert into blog_posts
      (title, excerpt, content, category, tags, thumbnail, author_id)
      values ($1,$2,$3,$4,$5,$6,$7)
      returning *`,
      [title, excerpt, content, category, tags, thumbnail, author_id]
    )

    return res.json(rows[0])
  }

  res.status(405).end()
}