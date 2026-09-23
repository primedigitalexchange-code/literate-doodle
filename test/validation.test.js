const test = require('node:test');
const assert = require('node:assert/strict');

const {
  containsProhibitedBankFields,
  evaluateAccountPayoutReadiness,
  validateCreateAccountRequest,
  validatePayoutRequest,
} = require('../src/validation');
const { createAppConfig } = require('../src/config');

test('createAppConfig reports missing required configuration', () => {
  const config = createAppConfig({});

  assert.deepEqual(config.missingEnvVars.sort(), ['APP_BASE_URL', 'STRIPE_SECRET_KEY']);
  assert.deepEqual(config.supportedPayoutCurrencies, ['usd']);
});

test('validateCreateAccountRequest rejects prohibited bank credential fields', () => {
  const errors = validateCreateAccountRequest({ bankUsername: 'boa-user' });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /Stripe-hosted onboarding/);
});

test('containsProhibitedBankFields detects raw bank detail fields', () => {
  assert.deepEqual(containsProhibitedBankFields({ routingNumber: '123', amount: 10 }), ['routingNumber']);
});

test('validatePayoutRequest validates id, amount, currency, and prohibited fields', () => {
  const errors = validatePayoutRequest(
    {
      connectedAccountId: 'bad',
      amount: 0,
      currency: 'us',
      accountNumber: '000123456789',
    },
    ['usd']
  );

  assert.equal(errors.length, 4);
  assert.match(errors.join(' '), /Do not send raw bank details/);
});

test('evaluateAccountPayoutReadiness returns blockers when account is incomplete', () => {
  const result = evaluateAccountPayoutReadiness({
    details_submitted: false,
    payouts_enabled: false,
    charges_enabled: true,
    capabilities: { transfers: 'pending' },
    requirements: { currently_due: ['external_account'] },
  });

  assert.equal(result.isReady, false);
  assert.deepEqual(result.currentlyDue, ['external_account']);
  assert.match(result.blockers.join(' '), /onboarding is not complete/i);
  assert.match(result.blockers.join(' '), /transfers capability/i);
});

test('evaluateAccountPayoutReadiness allows transfer-only accounts without charges enabled', () => {
  const result = evaluateAccountPayoutReadiness({
    details_submitted: true,
    payouts_enabled: true,
    charges_enabled: false,
    capabilities: { transfers: 'active' },
    requirements: { currently_due: [] },
  });

  assert.equal(result.isReady, true);
  assert.deepEqual(result.blockers, []);
});
