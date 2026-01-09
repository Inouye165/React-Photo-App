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
    .map((h) => h.toLowerCase())
    // Only allow explicit hostnames. Patterns (e.g. "*.example.com" or ".example.com")
    // are intentionally excluded for SSRF defense.
    .filter((h) => !h.includes('*') && !h.startsWith('.'));
}

function pickExplicitAllowlistedHost(hostname, allowedHosts) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return null;

  // `allowedHosts` is pre-filtered to contain only explicit hostnames.
  return allowedHosts.includes(h) ? h : null;
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
  // In test, we skip DNS resolution to keep unit tests deterministic.
  if (process.env.NODE_ENV === 'test') {
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

function normalizeAndValidateProxyTarget(rawUrl, { allowedHosts }) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    const err = new Error('Invalid url');
    err.code = 'IMAGE_PROXY_INVALID_URL';
    throw err;
  }

  // No credentials in URL
  if (target.username || target.password) {
    const err = new Error('URL credentials are not allowed');
    err.code = 'IMAGE_PROXY_CREDENTIALS';
    throw err;
  }

  // Protocol restrictions
  const isHttp = target.protocol === 'http:';
  const isHttps = target.protocol === 'https:';
  if (!isHttp && !isHttps) {
    const err = new Error('Only http/https URLs are supported');
    err.code = 'IMAGE_PROXY_PROTOCOL';
    throw err;
  }

  if (isHttp && process.env.NODE_ENV === 'production') {
    const err = new Error('HTTP URLs are not allowed in production');
    err.code = 'IMAGE_PROXY_HTTP_IN_PROD';
    throw err;
  }

  // Allowlist: secure-by-default
  if (!allowedHosts.length) {
    const err = new Error('Image proxy is not configured');
    err.code = 'IMAGE_PROXY_NOT_CONFIGURED';
    throw err;
  }

  // Only allow explicit hostnames from the server-provided allowlist.
  const allowlistedHost = pickExplicitAllowlistedHost(target.hostname, allowedHosts);
  if (!allowlistedHost) {
    const err = new Error('Target host not allowlisted');
    err.code = 'IMAGE_PROXY_HOST_NOT_ALLOWED';
    throw err;
  }

  // Validate and normalize ports.
  let normalizedPort = '';
  if (target.port) {
    const port = Number(target.port);
    const allowedPorts = new Set([80, 443]);
    if (!Number.isInteger(port) || !allowedPorts.has(port)) {
      const err = new Error('Target port not allowed');
      err.code = 'IMAGE_PROXY_PORT_NOT_ALLOWED';
      throw err;
    }

    if (process.env.NODE_ENV === 'production' && port !== 443) {
      const err = new Error('Target port not allowed in production');
      err.code = 'IMAGE_PROXY_PORT_NOT_ALLOWED';
      throw err;
    }

    normalizedPort = String(port);
  }

  // Basic path hardening (prevents weirdness like backslashes and traversal).
  if (target.pathname.includes('\\') || target.pathname.includes('..')) {
    const err = new Error('Target path not allowed');
    err.code = 'IMAGE_PROXY_PATH_NOT_ALLOWED';
    throw err;
  }

  // Reconstruct a fresh URL from trusted components. This breaks the taint chain
  // (CodeQL) from the original user-provided URL while keeping the validated
  // path/query.
  const base = `${target.protocol}//${allowlistedHost}${normalizedPort ? `:${normalizedPort}` : ''}`;
  const safe = new URL(base);
  safe.pathname = target.pathname;
  safe.search = target.search;
  safe.hash = '';
  safe.username = '';
  safe.password = '';

  return safe;
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
  let current = normalizeAndValidateProxyTarget(url, { allowedHosts });
  await assertHostSafeForProxy(current.hostname);

  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await fetch(current.toString(), { ...fetchOptions, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400 && res.headers && res.headers.get('location')) {
      const loc = res.headers.get('location');
      const candidate = new URL(loc, current);
      const nextUrl = normalizeAndValidateProxyTarget(candidate.toString(), { allowedHosts });
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

      const target = normalizeAndValidateProxyTarget(rawUrl, { allowedHosts });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image proxy failed';

      if (err && typeof err === 'object' && err.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'Upstream timeout' });
      }

      if (err && typeof err === 'object' && err.code === 'IMAGE_PROXY_PRIVATE_IP') {
        return res.status(403).json({ success: false, error: 'Target not allowed' });
      }

      if (err && typeof err === 'object' && typeof err.code === 'string') {
        const code = err.code;
        const clientMsg =
          code === 'IMAGE_PROXY_INVALID_URL'
            ? 'Invalid url'
            : code === 'IMAGE_PROXY_CREDENTIALS'
              ? 'URL credentials are not allowed'
              : code === 'IMAGE_PROXY_PROTOCOL'
                ? 'Only http/https URLs are supported'
                : code === 'IMAGE_PROXY_HTTP_IN_PROD'
                  ? 'HTTP URLs are not allowed in production'
                  : code === 'IMAGE_PROXY_NOT_CONFIGURED'
                    ? 'Image proxy is not configured'
                    : code === 'IMAGE_PROXY_HOST_NOT_ALLOWED'
                      ? 'Target host not allowlisted'
                      : code === 'IMAGE_PROXY_PORT_NOT_ALLOWED'
                        ? 'Target port not allowed'
                        : code === 'IMAGE_PROXY_PATH_NOT_ALLOWED'
                          ? 'Target path not allowed'
                          : null;

        if (clientMsg) {
          const status = code === 'IMAGE_PROXY_NOT_CONFIGURED' ? 403 : 400;
          return res.status(status).json({ success: false, error: clientMsg });
        }
      }

      return res.status(502).json({ success: false, error: message });
    }
  };

  router.get('/', handler);
  router.head('/', handler);

  return router;
}

module.exports = createImageProxyRouter;
