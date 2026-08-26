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

const sendErrorPage = (res, status, message) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    `<!doctype html><meta charset="utf-8"><title>Download failed</title>` +
      `<p style="font-family:sans-serif;padding:24px">${message}</p>`,
  );
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
    sendErrorPage(res, 405, 'Method not allowed');
    return;
  }

  try {
    const q = req.query || {};
    const urlParam = typeof q.url === 'string' ? q.url : '';
    const fileParam = typeof q.file === 'string' ? q.file : '';
    let downloadName = safeFileName(q.name, fileParam || 'download');

    let upstreamUrl = '';
    if (urlParam) {
      if (!isAllowedUploadUrl(urlParam)) {
        sendErrorPage(res, 400, 'Invalid file url');
        return;
      }
      upstreamUrl = urlParam;
    } else if (fileParam) {
      const safe = fileParam.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safe) {
        sendErrorPage(res, 400, 'Invalid file');
        return;
      }
      upstreamUrl = UPLOADS_PREFIX + safe;
    } else {
      sendErrorPage(res, 400, 'Missing url or file');
      return;
    }

    const upstream = await fetch(upstreamUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      sendErrorPage(
        res,
        upstream.status === 404 ? 404 : 502,
        upstream.status === 404 ? 'File not found' : 'Could not fetch file',
      );
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    const head = buf.slice(0, Math.min(buf.length, 80)).toString('utf8').trim();
    const isPdf = head.startsWith('%PDF') || downloadName.toLowerCase().endsWith('.pdf') || upstreamType.includes('pdf');

    if (
      upstreamType.includes('json') ||
      upstreamType.includes('text/html') ||
      (buf.length < 512 && (head.startsWith('{') || head.startsWith('<')))
    ) {
      sendErrorPage(res, 502, 'Upstream did not return a file');
      return;
    }

    if (buf.length < 32) {
      sendErrorPage(res, 502, 'File too small');
      return;
    }

    if (isPdf && !downloadName.toLowerCase().endsWith('.pdf')) {
      downloadName += '.pdf';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buf);
  } catch (err) {
    sendErrorPage(res, 502, 'Download proxy failed');
  }
};
