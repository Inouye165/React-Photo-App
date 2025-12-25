/* eslint-env jest */

const { EventEmitter } = require('events');

const { createMetrics } = require('../metrics');
const { instrumentKnex } = require('../metrics/knex');

function findHistogramCount(metric, labels) {
  return metric.values.find((v) => {
    if (!v.metricName.endsWith('_count')) return false;
    const got = v.labels || {};
    return got.operation === labels.operation && got.table === labels.table;
  });
}

describe('Knex metrics instrumentation', () => {
  test('records duration and counts without exposing SQL', async () => {
    const metrics = createMetrics();
    const db = new EventEmitter();

    instrumentKnex({ db, metrics });

    const query = {
      __knexQueryUid: '1',
      method: 'select',
      sql: 'select * from photos where id = ?',
    };

    db.emit('query', query);
    db.emit('query-response', { rows: [] }, query);

    const durationMetric = await metrics.dbQueryDurationMs.get();
    const countEntry = findHistogramCount(durationMetric, { operation: 'select', table: 'photos' });

    expect(countEntry).toBeTruthy();
    expect(countEntry.value).toBe(1);

    const totalMetric = await metrics.dbQueriesTotal.get();
    expect(totalMetric.values.some((v) => v.labels.operation === 'select' && v.labels.table === 'photos' && v.labels.result === 'ok')).toBe(true);

    // SECURITY: ensure SQL text isn't accidentally present in label values.
    for (const v of [...durationMetric.values, ...totalMetric.values]) {
      for (const labelValue of Object.values(v.labels || {})) {
        const s = String(labelValue);
        expect(s).not.toMatch(/\s/);
        expect(s.toLowerCase()).not.toContain('where');
        expect(s).not.toContain('?');
        expect(s).not.toContain('*');
        expect(s).not.toContain('=');
      }
    }
  });
});
