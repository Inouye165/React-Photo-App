const request = require('supertest');
const { performance } = require('perf_hooks');

// Import the actual server app
let app;
try {
  app = require('../server');
} catch (e) {
  if (typeof require('../server') === 'function') {
    app = require('../server')();
  } else {
    throw e;
  }
}

describe('Auth Timing Attack Mitigation', () => {
  const validUsername = 'timingtestuser';
  const validPassword = 'Password123!';
  const invalidUsername = 'nonexistentuser';

  beforeAll(async () => {
    // Register a user for the valid case
    await request(app)
      .post('/auth/register')
      .send({
        username: validUsername,
        email: 'timing@example.com',
        password: validPassword
      });
  });

  it('should have similar response times for valid and invalid usernames', async () => {
    // Warm up
    await request(app).post('/auth/login').send({ username: validUsername, password: 'WrongPassword123!' });
    await request(app).post('/auth/login').send({ username: invalidUsername, password: 'WrongPassword123!' });

    const iterations = 5;
    let totalValidTime = 0;
    let totalInvalidTime = 0;

    for (let i = 0; i < iterations; i++) {
      // Measure valid user + wrong password
      const startValid = performance.now();
      await request(app)
        .post('/auth/login')
        .send({ username: validUsername, password: 'WrongPassword123!' });
      const endValid = performance.now();
      totalValidTime += (endValid - startValid);

      // Measure invalid user
      const startInvalid = performance.now();
      await request(app)
        .post('/auth/login')
        .send({ username: invalidUsername, password: 'WrongPassword123!' });
      const endInvalid = performance.now();
      totalInvalidTime += (endInvalid - startInvalid);
    }

    const avgValidTime = totalValidTime / iterations;
    const avgInvalidTime = totalInvalidTime / iterations;
    const difference = Math.abs(avgValidTime - avgInvalidTime);

    console.log(`Average Valid User (Wrong Pass) Time: ${avgValidTime.toFixed(2)}ms`);
    console.log(`Average Invalid User Time: ${avgInvalidTime.toFixed(2)}ms`);
    console.log(`Difference: ${difference.toFixed(2)}ms`);

    // Assert that the difference is within a reasonable threshold (e.g., 100ms)
    // Note: In a real bcrypt scenario, the difference without mitigation would be ~100-300ms depending on cost factor.
    // With mitigation, it should be very close (mostly network/overhead noise).
    expect(difference).toBeLessThan(150); 
  }, 30000); // Increase timeout for multiple requests
});
