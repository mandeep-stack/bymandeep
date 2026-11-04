// bymandeep.com: serves static pages straight from the GitHub repo.
// Only .html and .json files are ever served. Everything else returns 404.

const ORIGIN = 'https://raw.githubusercontent.com/mandeep-stack/bymandeep/main';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8' };

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function respond(body, status, extra) {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

function notFound() {
  return respond('Not found', 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
}

// Turn a request path into a repo file path, or null if it is not allowed.
function resolvePath(pathname) {
  // block anything odd before it reaches GitHub
  if (/[%\\\u0000-\u001f]/.test(pathname) || pathname.includes('//') || pathname.includes('..')) return null;
  if (pathname.split('/').some((seg) => seg.startsWith('.'))) return null; // .git, .env, dotfiles

  let path = pathname;
  if (path.endsWith('/')) path += 'index.html';
  else if (!path.split('/').pop().includes('.')) path += '/index.html';

  const ext = path.split('.').pop().toLowerCase();
  if (!TYPES[ext]) return null;               // worker.js, wrangler.jsonc, README, images, etc.
  if (!/^\/[A-Za-z0-9._\/-]+$/.test(path)) return null;
  return path;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respond('Method not allowed', 405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    }

    const url = new URL(request.url);
    const path = resolvePath(url.pathname);
    if (!path) return notFound();

    let upstream;
    try {
      upstream = await fetch((env && env.ORIGIN ? env.ORIGIN : ORIGIN) + path, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
    } catch (e) {
      return respond('Temporarily unavailable', 502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (upstream.status === 404) return notFound();
    if (!upstream.ok) {
      return respond('Temporarily unavailable', 502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    const ext = path.split('.').pop().toLowerCase();
    const headers = { 'Content-Type': TYPES[ext], 'Cache-Control': 'public, max-age=300' };
    // booking page must never show up in search
    if (path.startsWith('/book-')) headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';

    // fresh headers only; nothing from GitHub is passed through
    return respond(request.method === 'HEAD' ? null : upstream.body, 200, headers);
  },
};
