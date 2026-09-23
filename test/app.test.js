const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp, normalizeStripeSignatureHeader } = require('../src/app');

function createConfig(overrides = {}) {
  return {
    appBaseUrl: 'http://localhost:3000',
    stripeSecretKey: 'sk_test_123',
    stripeWebhookSecret: 'whsec_123',
    supportedPayoutCurrencies: ['usd'],
    missingEnvVars: [],
    ...overrides,
  };
}

test('POST /api/connect/accounts returns account id and onboarding url', async () => {
  const stripeService = {
    createExpressAccount: async () => ({ id: 'acct_123' }),
    createAccountLink: async () => ({ url: 'https://stripe.test/onboard', expires_at: 123456 }),
  };
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/connect/accounts')
    .send({ email: 'seller@example.com', country: 'us' });

  assert.equal(response.status, 201);
  assert.equal(response.body.accountId, 'acct_123');
  assert.equal(response.body.onboardingUrl, 'https://stripe.test/onboard');
});

test('POST /api/payouts rejects invalid payloads and raw bank details', async () => {
  const stripeService = {};
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/payouts')
    .send({ connectedAccountId: 'acct_123', amount: 10, currency: 'usd', routingNumber: '110000000' });

  assert.equal(response.status, 400);
  assert.match(response.body.details[0], /Do not send raw bank details/);
});

test('POST /api/payouts blocks transfers when Stripe account is not ready', async () => {
  const stripeService = {
    getConnectedAccount: async () => ({
      id: 'acct_123',
      details_submitted: false,
      payouts_enabled: false,
      charges_enabled: false,
      capabilities: { transfers: 'pending' },
      requirements: { currently_due: ['external_account'] },
    }),
  };
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/payouts')
    .send({ connectedAccountId: 'acct_123', amount: 2500, currency: 'usd' });

  assert.equal(response.status, 409);
  assert.deepEqual(response.body.requirementsCurrentlyDue, ['external_account']);
});

test('POST /api/payouts creates a transfer when the Stripe account is ready', async () => {
  let transferInput;
  const stripeService = {
    getConnectedAccount: async () => ({
      id: 'acct_123',
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: true,
      capabilities: { transfers: 'active' },
      requirements: { currently_due: [] },
    }),
    createTransfer: async (input) => {
      transferInput = input;
      return { id: 'tr_123', destination: input.connectedAccountId, amount: input.amount, currency: input.currency };
    },
  };
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/payouts')
    .send({ connectedAccountId: 'acct_123', amount: 2500, currency: 'USD' });

  assert.equal(response.status, 201);
  assert.deepEqual(transferInput, { connectedAccountId: 'acct_123', amount: 2500, currency: 'usd' });
  assert.equal(response.body.transferId, 'tr_123');
});

test('POST /api/payouts rejects requests without a currency', async () => {
  const stripeService = {};
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app).post('/api/payouts').send({ connectedAccountId: 'acct_123', amount: 2500 });

  assert.equal(response.status, 400);
  assert.match(response.body.details.join(' '), /currency is required/i);
});

test('POST /api/payouts blocks transfers when the transfers capability is missing', async () => {
  const stripeService = {
    getConnectedAccount: async () => ({
      id: 'acct_123',
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: true,
      capabilities: {},
      requirements: { currently_due: [] },
    }),
  };
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/payouts')
    .send({ connectedAccountId: 'acct_123', amount: 2500, currency: 'usd' });

  assert.equal(response.status, 409);
  assert.match(response.body.details.join(' '), /transfers capability/i);
});

test('POST /api/webhooks/stripe verifies the event through the injected Stripe service', async () => {
  let constructArgs;
  const stripeService = {
    constructWebhookEvent: (payload, signature, secret) => {
      constructArgs = { payload: payload.toString(), signature, secret };
      return { type: 'account.updated' };
    },
  };
  const app = createApp({ config: createConfig(), stripeService });

  const response = await request(app)
    .post('/api/webhooks/stripe')
    .set('stripe-signature', 't=1,v1=abc')
    .set('content-type', 'application/json')
    .send(JSON.stringify({ id: 'evt_123' }));

  assert.equal(response.status, 200);
  assert.equal(response.body.type, 'account.updated');
  assert.equal(constructArgs.signature, 't=1,v1=abc');
  assert.equal(constructArgs.secret, 'whsec_123');
});

test('normalizeStripeSignatureHeader rejects multiple signature values', () => {
  const result = normalizeStripeSignatureHeader(['t=1,v1=abc', 't=2,v1=def']);

  assert.equal(result.error, 'Multiple Stripe signature headers are not allowed.');
});

test('POST /api/webhooks/stripe rejects a missing signature header', async () => {
  const app = createApp({ config: createConfig(), stripeService: {} });

  const response = await request(app).post('/api/webhooks/stripe').set('content-type', 'application/json').send('{}');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Missing Stripe signature header.');
});

test('GET /onboarding/return rejects a missing account query parameter', async () => {
  const app = createApp({ config: createConfig(), stripeService: {} });

  const response = await request(app).get('/onboarding/return');

  assert.equal(response.status, 400);
  assert.match(response.text, /Missing account query parameter/);
});

test('GET /onboarding/return rejects an invalid account query parameter', async () => {
  const app = createApp({ config: createConfig(), stripeService: {} });

  const response = await request(app).get('/onboarding/return?account=not-an-account');

  assert.equal(response.status, 400);
  assert.match(response.text, /valid Stripe account ID/);
});

test('GET /onboarding/return renders when the account query parameter is valid', async () => {
  const app = createApp({ config: createConfig(), stripeService: {} });

  const response = await request(app).get('/onboarding/return?account=acct_123');

  assert.equal(response.status, 200);
  assert.match(response.text, /Review the connected account status in Stripe/);
});
