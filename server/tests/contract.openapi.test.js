const request = require('supertest');
const express = require('express');
const jestOpenAPI = require('jest-openapi').default;
const createHealthRouter = require('../routes/health');
const createPhotosRouter = require('../routes/photos');
const db = require('../db');

describe('API contract (OpenAPI)', () => {
  let app;
  beforeAll(() => {
    jestOpenAPI(require('path').join(__dirname, '../openapi.yml'));
    app = express();
    app.use('/health', createHealthRouter());
    app.use('/photos', createPhotosRouter({ db }));
  });

  it('GET /health matches OpenAPI spec', async () => {
    const res = await request(app).get('/health');
    expect(res).toSatisfyApiSpec();
  });

  it('GET /photos matches OpenAPI spec', async () => {
    const res = await request(app).get('/photos');
    expect(res).toSatisfyApiSpec();
  });
});
