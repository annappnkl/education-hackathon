#!/usr/bin/env node
/* ─────────────────────────────────────────────
   Research Studio — local dev server
   Serves static files + proxies PDF URLs
   server-side so browser CORS doesn't block them
   Usage: node server.js
───────────────────────────────────────────── */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3000;
const DIR  = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

// Fetch a URL server-side, following redirects (max 5)
function fetchRemote(targetUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));

    const lib     = targetUrl.startsWith('https') ? https : http;
    const req     = lib.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept':     'application/pdf, */*;q=0.8',
        'Referer':    'https://scholar.google.com/',
      },
      timeout: 20000,
    }, res => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, targetUrl).href;
        res.resume(); // drain
        return fetchRemote(next, redirectsLeft - 1).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data',  c => chunks.push(c));
      res.on('end',   () => resolve({
        statusCode:  res.statusCode,
        contentType: res.headers['content-type'] || '',
        body:        Buffer.concat(chunks),
      }));
      res.on('error', reject);
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ── Request handler ───────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS — allow browser fetch from any localhost port
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── /proxy?url=https://... ── generic CORS proxy (any content type)
  if (parsed.pathname === '/proxy') {
    const targetUrl = parsed.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing ?url= parameter');
    }
    try {
      console.log(`  → Proxying: ${targetUrl.slice(0, 80)}…`);
      const result = await fetchRemote(targetUrl);
      res.writeHead(result.statusCode, {
        'Content-Type': result.contentType || 'application/octet-stream',
      });
      return res.end(result.body);
    } catch (err) {
      console.error(`  ✗ Proxy error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end(`Proxy error: ${err.message}`);
    }
  }

  // ── /proxy-pdf?url=https://... ───────────────
  if (parsed.pathname === '/proxy-pdf') {
    const targetUrl = parsed.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing ?url= parameter');
    }

    try {
      console.log(`  → Proxying PDF: ${targetUrl.slice(0, 80)}…`);
      const result = await fetchRemote(targetUrl);

      const isPDF = result.contentType.includes('pdf');
      const isOK  = result.statusCode >= 200 && result.statusCode < 300;

      if (!isOK || !isPDF) {
        // Not a real PDF — tell the client so it can fall back to abstract view
        res.writeHead(422, { 'Content-Type': 'text/plain' });
        return res.end(`Not a PDF (status=${result.statusCode}, type=${result.contentType})`);
      }

      res.writeHead(200, {
        'Content-Type':   'application/pdf',
        'Content-Length': result.body.length,
      });
      return res.end(result.body);

    } catch (err) {
      console.error(`  ✗ Proxy error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end(`Proxy error: ${err.message}`);
    }
  }

  // ── Static file serving ───────────────────────
  let filePath = parsed.pathname === '/'
    ? path.join(DIR, 'index.html')
    : path.join(DIR, parsed.pathname);

  // Prevent path traversal
  if (!filePath.startsWith(DIR + path.sep) && filePath !== path.join(DIR, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(500); return res.end(err.message);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  Research Studio  →  http://localhost:${PORT}\n`);
});
