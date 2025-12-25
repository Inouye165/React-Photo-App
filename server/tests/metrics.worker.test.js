/* eslint-env jest */

const { EventEmitter } = require('events');

const { createMetrics } = require('../metrics');
const { attachBullmqWorkerMetrics } = require('../metrics/bullmq');

function getMetricValueEntry(metric, nameSuffix) {
  const entry = metric.values.find((v) => v.metricName.endsWith(nameSuffix));
  if (!entry) throw new Error(`Missing metric entry ending with ${nameSuffix}`);
  return entry;
}

describe('BullMQ worker metrics', () => {
  test('increments duration histogram and failure counter without high-cardinality labels', async () => {
    const metrics = createMetrics();
    const worker = new EventEmitter();

    attachBullmqWorkerMetrics({
      worker,
      queueName: 'ai-processing',
      metrics,
    });

    worker.emit('completed', { processedOn: 1000, finishedOn: 1500 });
    worker.emit('failed', { processedOn: 2000, finishedOn: 2600 });

    const duration = await metrics.bullmqJobDurationMs.get();
    const countEntry = getMetricValueEntry(duration, '_count');

    expect(countEntry.labels).toEqual({ queue: 'ai-processing' });
    expect(countEntry.value).toBe(2);

    const failures = await metrics.bullmqJobFailuresTotal.get();
    expect(failures.values).toHaveLength(1);
    expect(failures.values[0].labels).toEqual({ queue: 'ai-processing' });
    expect(failures.values[0].value).toBe(1);
  });
});
