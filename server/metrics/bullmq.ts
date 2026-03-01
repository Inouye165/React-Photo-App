// @ts-nocheck

function attachBullmqWorkerMetrics({ worker, queueName, metrics }) {
  if (!worker || typeof worker.on !== 'function') {
    throw new Error('worker must be an EventEmitter-like object');
  }
  if (!metrics || typeof metrics.observeBullmqJobDuration !== 'function') {
    throw new Error('metrics helpers are required');
  }

  function calcDurationMs(job) {
    const processedOn = Number(job && job.processedOn);
    const finishedOn = Number(job && job.finishedOn);

    if (Number.isFinite(processedOn) && Number.isFinite(finishedOn)) {
      return Math.max(0, finishedOn - processedOn);
    }

    if (Number.isFinite(processedOn)) {
      return Math.max(0, Date.now() - processedOn);
    }

    return null;
  }

  worker.on('completed', (job) => {
    const d = calcDurationMs(job);
    if (d != null) {
      metrics.observeBullmqJobDuration(queueName, d);
    }
  });

  worker.on('failed', (job) => {
    metrics.incBullmqJobFailure(queueName);
    const d = calcDurationMs(job);
    if (d != null) {
      metrics.observeBullmqJobDuration(queueName, d);
    }
  });
}

async function sampleBullmqQueueCounts({ queue, queueName, metrics }) {
  if (!metrics || typeof metrics.setBullmqQueueJobs !== 'function') {
    throw new Error('metrics helpers are required');
  }

  if (!queue || typeof queue.getJobCounts !== 'function') {
    metrics.setBullmqQueueJobs(queueName, {
      active: 0,
      waiting: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    });
    return;
  }

  try {
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed');
    metrics.setBullmqQueueJobs(queueName, counts);
  } catch {
    metrics.incScrapeError('redis');
    metrics.setBullmqQueueJobs(queueName, {
      active: 0,
      waiting: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    });
  }
}

module.exports = {
  attachBullmqWorkerMetrics,
  sampleBullmqQueueCounts,
};
