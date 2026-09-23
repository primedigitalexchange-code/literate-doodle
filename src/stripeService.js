const Stripe = require('stripe');

function createStripeService(config) {
  const stripe = new Stripe(config.stripeSecretKey);

  return {
    async createExpressAccount({ email, country = 'US' }) {
      return stripe.accounts.create({
        type: 'express',
        country,
        email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
      });
    },

    async createAccountLink(accountId) {
      return stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${config.appBaseUrl}/onboarding/refresh?account=${encodeURIComponent(accountId)}`,
        return_url: `${config.appBaseUrl}/onboarding/return?account=${encodeURIComponent(accountId)}`,
        type: 'account_onboarding',
      });
    },

    async getConnectedAccount(accountId) {
      return stripe.accounts.retrieve(accountId);
    },

    async createTransfer({ connectedAccountId, amount, currency }) {
      return stripe.transfers.create({
        amount,
        currency,
        destination: connectedAccountId,
        metadata: {
          integration: 'stripe-connect-foundation',
        },
      });
    },

    constructWebhookEvent(payload, signature, secret) {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    },
  };
}

module.exports = {
  createStripeService,
};
