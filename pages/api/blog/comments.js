//pages/api/blog/comments.js
import { pool } from '@/lib/db'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { post_id, author_name, text } = req.body

    const { rows } = await pool.query(
      `insert into blog_comments (post_id, author_name, text)
       values ($1,$2,$3)
       returning *`,
      [post_id, author_name, text]
    )

    return res.json(rows[0])
  }

  if (req.method === 'GET') {
    const { post_id } = req.query
    const { rows } = await pool.query(
      `select * from blog_comments
       where post_id = $1
       order by created_at desc`,
      [post_id]
    )
    return res.json(rows)
  }

  res.status(405).end()
}