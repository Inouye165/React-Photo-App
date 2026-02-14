/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

import type { NextFunction, Request, Response } from 'express';

export {};

type RequestWithUser = Request & { user?: { id: string } };

const express = require('express');
const request = require('supertest');

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('chess tutor route', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_API_VERSION = 'v1';
    process.env.GEMINI_TUTOR_MODEL = 'models/gemini-1.5-flash';

    mockGetGenerativeModel.mockImplementation(({ model, apiVersion }: { model: string; apiVersion?: string }) => {
      if (model === 'gemini-1.5-flash') {
        return {
          generateContent: async () => {
            const error = new Error('models/gemini-1.5-flash not found') as Error & {
              error?: { code: number; status: string; message: string };
            };
            error.error = {
              code: 404,
              status: 'NOT_FOUND',
              message: 'models/gemini-1.5-flash is not found for this environment',
            };
            throw error;
          },
        };
      }

      return {
        generateContent: mockGenerateContent.mockResolvedValue({
          response: {
            text: () => '{"positionSummary":"Playable position.","hints":["Improve development"],"focusAreas":["King safety"]}',
          },
        }),
        __meta: { model, apiVersion },
      };
    });
  });

  test('normalizes configured model and falls back when first model is 404', async () => {
    const createChessTutorRouter = require('../routes/chessTutor');

    const app = express();
    app.use(express.json());
    app.use((req: RequestWithUser, _res: Response, next: NextFunction) => {
      req.user = { id: 'test-user' };
      next();
    });
    app.use('/api/v1/chess-tutor', createChessTutorRouter());

    const res = await request(app)
      .post('/api/v1/chess-tutor/analyze')
      .send({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e4', 'e7e5'],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.model).toBe('gemini-2.5-flash');
    expect(res.body.apiVersion).toBe('v1');

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-1.5-flash',
      apiVersion: 'v1',
    }));

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-2.5-flash',
      apiVersion: 'v1',
    }));
  });
});
