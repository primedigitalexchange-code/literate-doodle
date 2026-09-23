const REQUIRED_ENV_VARS = ['APP_BASE_URL', 'STRIPE_SECRET_KEY'];

function parseSupportedCurrencies(value) {
  return (value || 'usd')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function getMissingEnvVars(env) {
  return REQUIRED_ENV_VARS.filter((key) => !env[key]);
}

function createAppConfig(env = process.env) {
  const supportedCurrencies = parseSupportedCurrencies(env.SUPPORTED_PAYOUT_CURRENCIES);

  return {
    port: Number(env.PORT || 3000),
    appBaseUrl: env.APP_BASE_URL,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    supportedPayoutCurrencies: supportedCurrencies.length ? supportedCurrencies : ['usd'],
    missingEnvVars: getMissingEnvVars(env),
  };
}

module.exports = {
  REQUIRED_ENV_VARS,
  createAppConfig,
};
