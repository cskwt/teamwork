/**
 * Same-origin download proxy for Hostinger uploads.
 * Forces Content-Disposition: attachment so the browser saves the file
 * instead of opening images/PDFs inline (and avoids CORS).
 *
 * GET /api/download?url=https://www.csapp.io/teamwork-api/uploads/...&name=file.jpeg
 * GET /api/download?file=id.jpg&name=file.jpeg
 */
const UPLOADS_PREFIX = 'https://www.csapp.io/teamwork-api/uploads/';

const isAllowedUploadUrl = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'www.csapp.io' && u.hostname !== 'csapp.io') return false;
    return u.pathname.startsWith('/teamwork-api/uploads/');
  } catch {
    return false;
  }
};

const safeFileName = (name, fallback) => {
  const raw = String(name || fallback || 'download').trim() || 'download';
  return raw.replace(/[\r\n"\\]/g, '_').slice(0, 180);
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const q = req.query || {};
    const urlParam = typeof q.url === 'string' ? q.url : '';
    const fileParam = typeof q.file === 'string' ? q.file : '';
    const downloadName = safeFileName(q.name, fileParam || 'download');

    let upstreamUrl = '';
    if (urlParam) {
      if (!isAllowedUploadUrl(urlParam)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid url' }));
        return;
      }
      upstreamUrl = urlParam;
    } else if (fileParam) {
      const safe = fileParam.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safe) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid file' }));
        return;
      }
      upstreamUrl = UPLOADS_PREFIX + safe;
    } else {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url or file' }));
      return;
    }

    const upstream = await fetch(upstreamUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      res.statusCode = upstream.status === 404 ? 404 : 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Upstream fetch failed', status: upstream.status }));
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    const head = buf.slice(0, Math.min(buf.length, 80)).toString('utf8').trim();

    // Reject JSON/HTML error bodies that would be saved as a fake "image"
    if (
      upstreamType.includes('json') ||
      upstreamType.includes('text/html') ||
      (buf.length < 512 && (head.startsWith('{') || head.startsWith('<')))
    ) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Upstream did not return a file', size: buf.length }));
      return;
    }

    if (buf.length < 32) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'File too small', size: buf.length }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Download proxy failed',
        detail: String(err && err.message),
      }),
    );
  }
};
