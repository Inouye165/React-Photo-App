function normalizeIdentifier(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).trim();
  if (s === '') return 'unknown';

  const unquoted = s.replace(/^"|"$/g, '');
  const lastSegment = unquoted.split('.').filter(Boolean).pop();
  return lastSegment || 'unknown';
}

function parseOperationAndTable(query) {
  const method = (query && query.method) ? String(query.method).toLowerCase() : '';
  const sql = (query && query.sql) ? String(query.sql) : '';
  const sqlLower = sql.toLowerCase();

  let operation = method || 'unknown';
  if (!operation || operation === 'raw') {
    const m = sqlLower.match(/^\s*(select|insert|update|delete)\b/);
    if (m) operation = m[1];
    else if (sqlLower.includes('select')) operation = 'select';
  }

  let table = 'unknown';

  if (operation === 'select' || operation === 'delete') {
    const m = sqlLower.match(/\bfrom\s+(["\w\.]+)\b/);
    if (m) table = normalizeIdentifier(m[1]);
  } else if (operation === 'insert') {
    const m = sqlLower.match(/\binto\s+(["\w\.]+)\b/);
    if (m) table = normalizeIdentifier(m[1]);
  } else if (operation === 'update') {
    const m = sqlLower.match(/^\s*update\s+(["\w\.]+)\b/);
    if (m) table = normalizeIdentifier(m[1]);
  }

  return {
    operation: operation || 'unknown',
    table: table || 'unknown',
  };
}

function instrumentKnex({ db, metrics }) {
  if (!db || typeof db.on !== 'function') {
    throw new Error('db must be a Knex instance or EventEmitter-like object');
  }
  if (!metrics || typeof metrics.observeDbQuery !== 'function') {
    throw new Error('metrics helpers are required');
  }

  const startByUid = new Map();
  const MAX_INFLIGHT = 10000;

  function getUid(query) {
    return query && (query.__knexQueryUid || query.__knexUid || query.uid);
  }

  function onQuery(query) {
    const uid = getUid(query);
    if (!uid) return;

    if (startByUid.size > MAX_INFLIGHT) {
      startByUid.clear();
    }

    startByUid.set(String(uid), process.hrtime.bigint());
  }

  function finish(query, result) {
    const uid = getUid(query);
    if (!uid) return;

    const key = String(uid);
    const start = startByUid.get(key);
    startByUid.delete(key);

    if (!start) return;

    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    const { operation, table } = parseOperationAndTable(query);
    metrics.observeDbQuery({
      operation,
      table,
      durationMs,
      result,
    });
  }

  function onQueryResponse(_response, query) {
    finish(query, 'ok');
  }

  function onQueryError(_error, query) {
    finish(query, 'error');
  }

  db.on('query', onQuery);
  db.on('query-response', onQueryResponse);
  db.on('query-error', onQueryError);

  return function stop() {
    // Knex's event emitter API doesn't consistently support `off/removeListener` across versions.
    // We keep this as a best-effort hook in case the instance supports it.
    try {
      if (typeof db.off === 'function') {
        db.off('query', onQuery);
        db.off('query-response', onQueryResponse);
        db.off('query-error', onQueryError);
      } else if (typeof db.removeListener === 'function') {
        db.removeListener('query', onQuery);
        db.removeListener('query-response', onQueryResponse);
        db.removeListener('query-error', onQueryError);
      }
    } catch {
      // ignore
    }
  };
}

module.exports = {
  instrumentKnex,
  parseOperationAndTable,
};
