// pages/api/verify-captcha.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ ok: false, error: "Missing captcha token" });
  }

  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ ok: false, error: "Captcha is not configured" });
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);

    const verifyResp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const payload = await verifyResp.json().catch(() => ({}));
    if (!payload?.success) {
      return res.status(400).json({
        ok: false,
        error: "Captcha verification failed",
        codes: payload?.["error-codes"] || null,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("captcha verify error", err);
    return res.status(500).json({ ok: false, error: "Captcha verification failed" });
  }
}
