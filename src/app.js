const path = require('node:path');
const express = require('express');

const { createAppConfig } = require('./config');
const { createStripeService } = require('./stripeService');
const {
  evaluateAccountPayoutReadiness,
  validateConnectedAccountId,
  validateCreateAccountRequest,
  validatePayoutRequest,
} = require('./validation');

function createApp({ config = createAppConfig(), stripeService = createStripeService(config) } = {}) {
  const app = express();
  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    if (!config.stripeWebhookSecret) {
      return res.status(503).json({
        error: 'Stripe webhook secret is not configured.',
      });
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe signature header.' });
    }

    try {
      const event = stripeService.constructWebhookEvent(req.body, signature, config.stripeWebhookSecret);

      return res.status(200).json({
        received: true,
        type: event.type,
        message:
          'Webhook verified. Add persistence, notifications, and reconciliation handling for this event before live money movement.',
      });
    } catch (error) {
      return res.status(400).json({
        error: 'Stripe webhook signature verification failed.',
        details: error.message,
      });
    }
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => {
    if (config.missingEnvVars.length > 0) {
      return res.status(503).json({
        status: 'configuration_error',
        missingEnvVars: config.missingEnvVars,
      });
    }

    return res.json({ status: 'ok' });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      appBaseUrl: config.appBaseUrl,
      supportedPayoutCurrencies: config.supportedPayoutCurrencies,
      bankSupportMessage:
        'Bank of America is supported through Stripe-hosted onboarding and external account verification. This application does not collect or verify bank credentials directly.',
    });
  });

  app.post('/api/connect/accounts', async (req, res, next) => {
    const validationErrors = validateCreateAccountRequest(req.body || {});
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Invalid request.', details: validationErrors });
    }

    try {
      const account = await stripeService.createExpressAccount({
        email: req.body?.email,
        country: (req.body?.country || 'US').toUpperCase(),
      });
      const accountLink = await stripeService.createAccountLink(account.id);

      return res.status(201).json({
        accountId: account.id,
        onboardingUrl: accountLink.url,
        expiresAt: accountLink.expires_at,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/payouts', async (req, res, next) => {
    const normalizedPayload = {
      ...req.body,
      currency: typeof req.body?.currency === 'string' ? req.body.currency.toLowerCase() : 'usd',
    };
    const validationErrors = validatePayoutRequest(normalizedPayload, config.supportedPayoutCurrencies);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid payout request.',
        details: validationErrors,
      });
    }

    try {
      const account = await stripeService.getConnectedAccount(normalizedPayload.connectedAccountId);
      const readiness = evaluateAccountPayoutReadiness(account);

      if (!readiness.isReady) {
        return res.status(409).json({
          error: 'Connected account is not ready for payouts/transfers.',
          details: readiness.blockers,
          requirementsCurrentlyDue: readiness.currentlyDue,
        });
      }

      const transfer = await stripeService.createTransfer({
        connectedAccountId: normalizedPayload.connectedAccountId,
        amount: normalizedPayload.amount,
        currency: normalizedPayload.currency,
      });

      return res.status(201).json({
        transferId: transfer.id,
        destination: transfer.destination,
        amount: transfer.amount,
        currency: transfer.currency,
        status: 'submitted',
        message:
          'Transfer created to the connected Stripe account. Final bank payout timing and verification remain managed by Stripe for the connected account.',
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/onboarding/refresh', async (req, res, next) => {
    try {
      const accountId = req.query.account;
      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).send('Missing account query parameter.');
      }
      const accountIdError = validateConnectedAccountId(accountId);
      if (accountIdError) {
        return res.status(400).send(accountIdError);
      }

      const link = await stripeService.createAccountLink(accountId);
      return res.redirect(link.url);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/onboarding/return', (req, res) => {
    const safeAccountId = escapeHtml(req.query.account || '');
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Stripe onboarding return</title></head>
  <body>
    <h1>Stripe onboarding returned control to your app</h1>
    <p>Connected account: ${safeAccountId}</p>
    <p>Persist the account status in your application before allowing live payouts.</p>
    <p><a href="/">Back to operator console</a></p>
  </body>
</html>`);
  });

  app.use((error, _req, res, _next) => {
    const statusCode = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const safeMessage = statusCode >= 500 ? 'Unable to complete the Stripe request.' : error.message;

    res.status(statusCode).json({
      error: safeMessage,
    });
  });

  return app;
}

module.exports = {
  createApp,
};
