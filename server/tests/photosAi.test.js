const createPhotosAi = require('../services/photosAi');

describe('photosAi service', () => {
  let addAIJob, MODEL_ALLOWLIST, service;
  beforeEach(() => {
    addAIJob = jest.fn();
    MODEL_ALLOWLIST = ['gpt-4', 'gpt-3.5', 'gpt-5'];
    service = createPhotosAi({ addAIJob, MODEL_ALLOWLIST });
  });

  it('successfully enqueues AI job', async () => {
    addAIJob.mockResolvedValue(true);
    await expect(service.enqueuePhotoAiJob('pid', { model: 'gpt-4' })).resolves.toBe(true);
    expect(addAIJob).toHaveBeenCalled();
  });

  it('throws when enqueueing fails', async () => {
    addAIJob.mockRejectedValue(new Error('fail'));
    await expect(service.enqueuePhotoAiJob('pid', {})).rejects.toThrow('fail');
  });

  it('accepts allowed model', () => {
    expect(service.isModelAllowed('gpt-4')).toBe(true);
  });

  it('rejects unallowed model', () => {
    expect(service.isModelAllowed('not-in-list')).toBe(false);
  });
});
