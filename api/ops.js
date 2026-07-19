/**
 * Same-origin proxy for Operations Screen sync.
 * Avoids browser CORS / flaky Hostinger edge issues.
 * Upstream: https://www.csapp.io/teamwork-api/ops-sync.php
 */
const UPSTREAM = 'https://www.csapp.io/teamwork-api/ops-sync.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const init = {
      method: req.method,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    };
    if (req.method === 'POST') {
      // Vercel may already parse body as object
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      init.body = body;
    }

    const upstream = await fetch(UPSTREAM, init);
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(text);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Upstream ops sync failed', detail: String(err && err.message) }));
  }
};
