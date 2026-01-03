'use strict';

const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

function parseAllowedHosts(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((h) => h.toLowerCase());
}

function hostMatchesAllowlist(hostname, allowedHosts) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;

  for (const entry of allowedHosts) {
    if (entry === h) return true;

    // Allow suffix matching via patterns like ".example.com" or "*.example.com"
    const suffix = entry.startsWith('*.') ? entry.slice(1) : entry;
    if (suffix.startsWith('.') && h.endsWith(suffix)) return true;
  }

  return false;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  const normalized = String(ip);

  if (net.isIP(normalized) === 4) {
    const parts = normalized.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;

    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;

    return false;
  }

  if (net.isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
    if (lower.startsWith('fe80')) return true; // fe80::/10 link-local
    return false;
  }

  return true;
}

async function assertHostSafeForProxy(hostname) {
  // Defense-in-depth: in production, resolve DNS and block private IPs.
  // In non-prod/test, we skip DNS resolution to keep dev/test deterministic.
  if (process.env.NODE_ENV !== 'production') {
    // Still block direct IP literals.
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        const err = new Error('Target host resolves to a private IP');
        err.code = 'IMAGE_PROXY_PRIVATE_IP';
        throw err;
      }
    }
    return;
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      const err = new Error('Target host resolves to a private IP');
      err.code = 'IMAGE_PROXY_PRIVATE_IP';
      throw err;
    }
    return;
  }

  const lookups = await dns.lookup(hostname, { all: true, verbatim: true });
  for (const rec of lookups || []) {
    if (isPrivateIp(rec.address)) {
      const err = new Error('Target host resolves to a private IP');
      err.code = 'IMAGE_PROXY_PRIVATE_IP';
      throw err;
    }
  }
}

function pickUpstreamHeadersForClient(upstreamHeaders) {
  const allow = new Set([
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'cache-control',
    'expires',
  ]);

  const out = {};
  upstreamHeaders.forEach((value, key) => {
    const k = String(key).toLowerCase();
    if (!allow.has(k)) return;
    out[k] = value;
  });

  return out;
}

function buildUpstreamRequestHeaders(req) {
  const out = {
    // Avoid compressed upstream payloads so Content-Length stays sane.
    'accept-encoding': 'identity',
  };

  const passthrough = ['accept', 'range', 'if-none-match', 'if-modified-since'];
  for (const h of passthrough) {
    const v = req.headers[h];
    if (typeof v === 'string' && v) out[h] = v;
  }

  return out;
}

async function fetchFollowingSafeRedirects(url, fetchOptions, { allowedHosts, maxRedirects = 3 }) {
  let current = new URL(url);

  for (let i = 0; i <= maxRedirects; i += 1) {
     
    const res = await fetch(current.toString(), { ...fetchOptions, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400 && res.headers && res.headers.get('location')) {
      const loc = res.headers.get('location');
      const nextUrl = new URL(loc, current);

      if (nextUrl.username || nextUrl.password) {
        throw new Error('Credentials in redirect URL are not allowed');
      }

      if (!['https:', 'http:'].includes(nextUrl.protocol)) {
        throw new Error('Redirect protocol not allowed');
      }

      if (nextUrl.protocol === 'http:' && process.env.NODE_ENV === 'production') {
        throw new Error('HTTP redirects not allowed in production');
      }

      if (!hostMatchesAllowlist(nextUrl.hostname, allowedHosts)) {
        throw new Error('Redirect host not allowlisted');
      }

      await assertHostSafeForProxy(nextUrl.hostname);

      // Exhaust body to avoid resource leaks before redirecting
      try {
        // Some mocks may not support body consumption; best-effort.
        if (res.body && typeof res.body.cancel === 'function') res.body.cancel();
      } catch {
        // ignore
      }

      current = nextUrl;
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

/**
 * Image Proxy route
 *
 * GET /api/image-proxy?url=https://...
 *
 * Goals:
 * - Stream bytes (don’t buffer large images)
 * - Forward the important image headers (Content-Type, ETag, Range support)
 * - Prevent SSRF / open-proxy abuse via strict allowlist
 */
function createImageProxyRouter() {
  const router = express.Router();

  const allowedHosts = parseAllowedHosts(process.env.IMAGE_PROXY_ALLOWED_HOSTS);

  const handler = async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      if (!rawUrl) {
        return res.status(400).json({ success: false, error: 'url query param is required' });
      }

      let target;
      try {
        target = new URL(rawUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid url' });
      }

      // No credentials in URL
      if (target.username || target.password) {
        return res.status(400).json({ success: false, error: 'URL credentials are not allowed' });
      }

      // Protocol restrictions
      const isHttp = target.protocol === 'http:';
      const isHttps = target.protocol === 'https:';
      if (!isHttp && !isHttps) {
        return res.status(400).json({ success: false, error: 'Only http/https URLs are supported' });
      }

      if (isHttp && process.env.NODE_ENV === 'production') {
        return res.status(400).json({ success: false, error: 'HTTP URLs are not allowed in production' });
      }

      // Allowlist: secure-by-default
      if (!allowedHosts.length) {
        return res.status(403).json({ success: false, error: 'Image proxy is not configured' });
      }

      if (!hostMatchesAllowlist(target.hostname, allowedHosts)) {
        return res.status(403).json({ success: false, error: 'Target host not allowlisted' });
      }

      await assertHostSafeForProxy(target.hostname);

      const controller = new AbortController();
      const timeoutMs = Number(process.env.IMAGE_PROXY_TIMEOUT_MS || 10_000);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const upstreamRes = await fetchFollowingSafeRedirects(
        target.toString(),
        {
          method: req.method,
          headers: buildUpstreamRequestHeaders(req),
          signal: controller.signal,
        },
        { allowedHosts }
      );

      clearTimeout(timeout);

      // Mirror upstream status codes (200/206/304/etc)
      res.status(upstreamRes.status);

      // CORS/canvas friendliness
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');

      // Copy key headers
      const picked = pickUpstreamHeadersForClient(upstreamRes.headers);
      for (const [k, v] of Object.entries(picked)) {
        if (v) res.set(k, v);
      }

      // If upstream didn't specify cache, keep it conservative.
      if (!res.get('Cache-Control')) {
        res.set('Cache-Control', 'private, max-age=300');
      }

      // HEAD should not include a body
      if (req.method === 'HEAD') {
        return res.end();
      }

      // Stream response body
      if (!upstreamRes.body) {
        const buf = Buffer.from(await upstreamRes.arrayBuffer());
        return res.send(buf);
      }

      const body = upstreamRes.body;
      const isWebReadableStream = body && typeof body.getReader === 'function';
      const isNodeReadableStream = body && typeof body.pipe === 'function';

      if (isWebReadableStream) {
        const nodeStream = Readable.fromWeb(body);
        await pipeline(nodeStream, res);
        return undefined;
      }

      if (isNodeReadableStream) {
        await pipeline(body, res);
        return undefined;
      }

      // Fallback: buffer
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buf);
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image proxy failed';

      if (err && typeof err === 'object' && err.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'Upstream timeout' });
      }

      if (err && typeof err === 'object' && err.code === 'IMAGE_PROXY_PRIVATE_IP') {
        return res.status(403).json({ success: false, error: 'Target not allowed' });
      }

      return res.status(502).json({ success: false, error: message });
    }
  };

  router.get('/', handler);
  router.head('/', handler);

  return router;
}

module.exports = createImageProxyRouter;
