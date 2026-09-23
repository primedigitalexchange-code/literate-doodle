const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]+$/;
const ISO_CURRENCY_PATTERN = /^[a-z]{3}$/;
const PROHIBITED_BANK_FIELDS = [
  'accountNumber',
  'routingNumber',
  'bankAccountNumber',
  'bankRoutingNumber',
  'bankUsername',
  'bankPassword',
  'bankToken',
  'externalAccount',
];

function containsProhibitedBankFields(payload = {}) {
  return PROHIBITED_BANK_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function validateConnectedAccountId(accountId) {
  if (!accountId || typeof accountId !== 'string' || !ACCOUNT_ID_PATTERN.test(accountId)) {
    return 'connectedAccountId must be a valid Stripe account ID starting with acct_.';
  }

  return null;
}

function validateAmount(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'amount must be a positive integer number of cents.';
  }

  return null;
}

function validateCurrency(currency, supportedCurrencies) {
  if (typeof currency !== 'string' || !ISO_CURRENCY_PATTERN.test(currency.toLowerCase())) {
    return 'currency must be a 3-letter ISO currency code.';
  }

  const normalizedCurrency = currency.toLowerCase();
  if (!supportedCurrencies.includes(normalizedCurrency)) {
    return `currency must be one of: ${supportedCurrencies.join(', ')}.`;
  }

  return null;
}

function validatePayoutRequest(payload, supportedCurrencies) {
  const errors = [];
  const prohibitedFields = containsProhibitedBankFields(payload);

  if (prohibitedFields.length > 0) {
    errors.push(`Do not send raw bank details. Remove: ${prohibitedFields.join(', ')}.`);
  }

  const accountIdError = validateConnectedAccountId(payload.connectedAccountId);
  if (accountIdError) {
    errors.push(accountIdError);
  }

  const amountError = validateAmount(payload.amount);
  if (amountError) {
    errors.push(amountError);
  }

  const currencyError = validateCurrency(payload.currency || 'usd', supportedCurrencies);
  if (currencyError) {
    errors.push(currencyError);
  }

  return errors;
}

function validateCreateAccountRequest(payload = {}) {
  const errors = [];
  const prohibitedFields = containsProhibitedBankFields(payload);

  if (prohibitedFields.length > 0) {
    errors.push(`Bank credentials and raw account details must be collected by Stripe-hosted onboarding only. Remove: ${prohibitedFields.join(', ')}.`);
  }

  if (payload.email && typeof payload.email !== 'string') {
    errors.push('email must be a string when provided.');
  }

  if (payload.country && (typeof payload.country !== 'string' || payload.country.length !== 2)) {
    errors.push('country must be a 2-letter ISO country code when provided.');
  }

  return errors;
}

function evaluateAccountPayoutReadiness(account) {
  const currentlyDue = account?.requirements?.currently_due || [];
  const transfersCapability = account?.capabilities?.transfers;
  const isTransferCapabilityReady = transfersCapability === 'active';
  const isReady = Boolean(
    account?.details_submitted &&
      account?.payouts_enabled &&
      account?.charges_enabled &&
      isTransferCapabilityReady
  );

  return {
    isReady,
    blockers: [
      !account?.details_submitted ? 'Stripe onboarding is not complete.' : null,
      !account?.payouts_enabled ? 'Payouts are not enabled on the connected account.' : null,
      !account?.charges_enabled ? 'Charges are not enabled on the connected account.' : null,
      !isTransferCapabilityReady ? 'The transfers capability is not active.' : null,
    ].filter(Boolean),
    currentlyDue,
  };
}

module.exports = {
  ACCOUNT_ID_PATTERN,
  PROHIBITED_BANK_FIELDS,
  containsProhibitedBankFields,
  evaluateAccountPayoutReadiness,
  validateAmount,
  validateConnectedAccountId,
  validateCreateAccountRequest,
  validateCurrency,
  validatePayoutRequest,
};
