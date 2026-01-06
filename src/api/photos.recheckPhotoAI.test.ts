import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recheckPhotoAI } from './photos';
import * as httpClient from './httpClient';
import { ApiError } from './httpClient';

describe('recheckPhotoAI', () => {
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = vi.spyOn(httpClient, 'request').mockResolvedValue({
      message: 'AI recheck queued',
      photoId: 123,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls recheck-ai endpoint with correct path', async () => {
    await recheckPhotoAI(123);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('/photos/123/recheck-ai'),
        method: 'POST',
      })
    );

    const callPath = mockRequest.mock.calls[0][0].path;
    // Ensure we don't have double /api
    expect(callPath).not.toMatch(/\/api\/api\//);
  });

  it('sends collectibleOverride in request body', async () => {
    const override = {
      id: 'SCOTT-C3',
      category: 'stamp',
      confirmedBy: 'human',
      fields: { name: 'Test Stamp' },
    };

    await recheckPhotoAI(123, null, { collectibleOverride: override });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          collectibleOverride: override,
        }),
      })
    );
  });

  it('sends model override when provided', async () => {
    await recheckPhotoAI(123, 'gpt-4o');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          model: 'gpt-4o',
        }),
      })
    );
  });

  it('maps legacy nested shape { identification: {...} } to flat shape', async () => {
    const legacyOverride = {
      identification: {
        id: 'SCOTT-C3',
        category: 'stamp',
        name: 'Test Stamp',
      },
      confirmedBy: 'human',
    } as any;

    await recheckPhotoAI(123, null, { collectibleOverride: legacyOverride });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          collectibleOverride: {
            id: 'SCOTT-C3',
            category: 'stamp',
            confirmedBy: 'human',
            fields: { name: 'Test Stamp' },
          },
        }),
      })
    );
  });

  it('handles already-flat override shape without modification', async () => {
    const flatOverride = {
      id: 'SCOTT-C3',
      category: 'stamp',
      confirmedBy: 'human',
      fields: { name: 'Test Stamp' },
    };

    await recheckPhotoAI(123, null, { collectibleOverride: flatOverride });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          collectibleOverride: flatOverride,
        }),
      })
    );
  });

  it('dispatches photo:run-ai event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await recheckPhotoAI(123);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'photo:run-ai',
        detail: { photoId: 123 },
      })
    );
  });

  it('returns undefined on 401/403 errors', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError('Unauthorized', { status: 401 }));

    const result = await recheckPhotoAI(123);
    expect(result).toBeUndefined();
  });

  it('returns null on other errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network error'));

    const result = await recheckPhotoAI(123);
    expect(result).toBeNull();
  });
});
