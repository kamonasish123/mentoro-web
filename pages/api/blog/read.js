// pages/api/blog/read.js
import { createClient } from '@supabase/supabase-js'

/**
 * Defensive blog read handler (updated).
 *  - For authenticated users: try inserting into blog_reads (deduped index).
 *      - If insert succeeds -> success (trigger inc_post_reads will have incremented reads).
 *      - If insert fails with duplicate -> success (already recorded).
 *      - If insert fails other -> fallback to RPC increment (safe single increment).
 *  - For anonymous visitors: call RPC increment_post_reads_direct (single increment).
 *  - Uses short timeouts to avoid hanging the route.
 */

const DEFAULT_TIMEOUT_MS = 4000;

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error('operation_timed_out');
      err.code = 'OP_TIMEOUT';
      reject(err);
    }, ms);

    promise
      .then((r) => { clearTimeout(t); resolve(r); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { post_id, user_id } = req.body || {};
  if (!post_id) return res.status(400).json({ ok: false, error: 'Missing post_id' });

  // read envs at request time
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    return res.status(500).json({ ok: false, error: 'Server misconfigured: missing Supabase env vars' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // helper: call RPC increment with timeout
    async function rpcIncrement(pid) {
      try {
        const rpcPromise = supabaseAdmin.rpc('increment_post_reads_direct', { p_id: pid });
        const rpcRes = await withTimeout(rpcPromise, DEFAULT_TIMEOUT_MS);
        return { ok: true, data: rpcRes.data, error: rpcRes.error || null };
      } catch (e) {
        return { ok: false, error: e };
      }
    }

    // 1) If user_id provided -> prefer inserting into blog_reads for dedupe/audit
    if (user_id) {
      try {
        const insertPromise = supabaseAdmin
          .from('blog_reads')
          .insert([{ post_id, user_id }], { returning: 'minimal' });
        const insertRes = await withTimeout(insertPromise, DEFAULT_TIMEOUT_MS);

        if (insertRes.error) {
          // check duplicate unique violation (already recorded)
          const err = insertRes.error;
          const code = String(err.code || '').toLowerCase();
          const details = String(err.details || '').toLowerCase();
          if (code === '23505' || details.includes('duplicate')) {
            // already recorded for this user -> nothing to do
            return res.status(200).json({ ok: true, inserted: 0, message: 'already_recorded' });
          }

          // other error (FK or network) -> fallback to RPC increment
          console.warn('blog_reads insert error, attempting RPC fallback:', err);
          const rpc = await rpcIncrement(post_id);
          if (rpc.ok && !rpc.error) {
            const reads = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0].reads : null;
            return res.status(200).json({ ok: true, inserted: 1, reads });
          }
          // RPC failed -> try best-effort direct read & update
          try {
            const fetchRes = await withTimeout(supabaseAdmin.from('blog_posts').select('reads').eq('id', post_id).limit(1), DEFAULT_TIMEOUT_MS);
            if (!fetchRes.error && fetchRes.data && fetchRes.data[0]) {
              const current = Number(fetchRes.data[0].reads || 0);
              const upRes = await withTimeout(supabaseAdmin.from('blog_posts').update({ reads: current + 1 }).eq('id', post_id), DEFAULT_TIMEOUT_MS);
              if (!upRes.error) return res.status(200).json({ ok: true, inserted: 1, reads: current + 1 });
            }
          } catch (e) {
            // ignore, handled below
            console.error('read+update fallback error', e);
          }

          console.error('All fallbacks failed after blog_reads insert error:', err);
          return res.status(200).json({ ok: false, inserted: 0, error: 'fallback_failed', details: String(err.message || err) });
        }

        // insert succeeded -> trigger inc_post_reads() will have incremented reads once, so return success
        return res.status(200).json({ ok: true, inserted: 1, message: 'recorded' });
      } catch (err) {
        // timeout or unexpected insert exception -> fallback to RPC & read-update
        console.warn('blog_reads insert unexpected error (timeout or other):', err);
        const rpc = await rpcIncrement(post_id);
        if (rpc.ok && !rpc.error) {
          const reads = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0].reads : null;
          return res.status(200).json({ ok: true, inserted: 1, reads });
        }
        // try read/update fallback
        try {
          const fRes = await withTimeout(supabaseAdmin.from('blog_posts').select('reads').eq('id', post_id).limit(1), DEFAULT_TIMEOUT_MS);
          if (!fRes.error && fRes.data && fRes.data[0]) {
            const current = Number(fRes.data[0].reads || 0);
            const upRes = await withTimeout(supabaseAdmin.from('blog_posts').update({ reads: current + 1 }).eq('id', post_id), DEFAULT_TIMEOUT_MS);
            if (!upRes.error) return res.status(200).json({ ok: true, inserted: 1, reads: current + 1 });
          }
        } catch (e) {
          console.error('read+update fallback after insert timeout failed', e);
        }

        return res.status(200).json({ ok: false, inserted: 0, error: 'all_fallbacks_failed' });
      }
    }

    // 2) Anonymous visitor -> try RPC increment (single increment). Fallback to read+update.
    const rpcRes = await (async () => {
      try {
        return await (async () => {
          return await (async () => {
            return await rpcIncrement(post_id);
          })();
        })();
      } catch (e) {
        return { ok: false, error: e };
      }
    })();

    if (rpcRes.ok && !rpcRes.error) {
      const reads = Array.isArray(rpcRes.data) && rpcRes.data.length ? rpcRes.data[0].reads : null;
      return res.status(200).json({ ok: true, inserted: 1, reads });
    }

    // fallback: fetch current reads and update (non-atomic)
    try {
      const fetchRes = await withTimeout(supabaseAdmin.from('blog_posts').select('reads').eq('id', post_id).limit(1), DEFAULT_TIMEOUT_MS);
      if (!fetchRes.error && fetchRes.data && fetchRes.data[0]) {
        const current = Number(fetchRes.data[0].reads || 0);
        const upRes = await withTimeout(supabaseAdmin.from('blog_posts').update({ reads: current + 1 }).eq('id', post_id), DEFAULT_TIMEOUT_MS);
        if (!upRes.error) return res.status(200).json({ ok: true, inserted: 1, reads: current + 1 });
      }
    } catch (e) {
      console.error('anonymous read fallback error', e);
    }

    console.error('anonymous increment rpc error or timeout; fallbacks failed:', rpcRes.error || 'unknown');
    return res.status(200).json({ ok: false, inserted: 0, error: 'unable_to_record_read' });
  } catch (topErr) {
    console.error('read handler unexpected error', topErr);
    return res.status(200).json({ ok: false, error: 'unexpected_handler_error', details: String(topErr?.message || topErr) });
  }
}
