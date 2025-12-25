const express = require('express');
const request = require('supertest');
const { z } = require('zod');

const { validateRequest } = require('../validation/validateRequest');

describe('validateRequest middleware', () => {
  test('invalid params returns 400 BAD_REQUEST envelope', async () => {
    const app = express();

    app.get(
      '/t/:id',
      validateRequest({
        params: z.object({
          id: z.string().uuid({ message: 'Invalid id' }),
        }),
      }),
      (req, res) => {
        res.json({ ok: true, id: req.validated.params.id });
      }
    );

    const response = await request(app)
      .get('/t/not-a-uuid')
      .set('x-request-id', 'req-params')
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: 'Invalid request',
      reqId: 'req-params',
      errorDetails: {
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: 'req-params',
      },
    });
  });

  test('invalid query returns 400 BAD_REQUEST envelope', async () => {
    const app = express();

    app.get(
      '/q',
      validateRequest({
        query: z.object({
          limit: z.preprocess(
            (v) => (v === undefined ? undefined : Number(v)),
            z.number().int().min(1).max(2)
          ),
        }),
      }),
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    const response = await request(app)
      .get('/q?limit=999')
      .set('x-request-id', 'req-query')
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: 'Invalid request',
      reqId: 'req-query',
      errorDetails: {
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: 'req-query',
      },
    });
  });

  test('invalid body returns 422 VALIDATION_ERROR envelope', async () => {
    const app = express();
    app.use(express.json());

    app.post(
      '/b',
      validateRequest({
        body: z.object({
          name: z.string().min(1),
        }),
      }),
      (req, res) => {
        res.json({ ok: true, name: req.validated.body.name });
      }
    );

    const response = await request(app)
      .post('/b')
      .set('x-request-id', 'req-body')
      .send({})
      .expect(422);

    expect(response.body).toEqual({
      success: false,
      error: 'Validation failed',
      reqId: 'req-body',
      errorDetails: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        requestId: 'req-body',
      },
    });
  });
});
