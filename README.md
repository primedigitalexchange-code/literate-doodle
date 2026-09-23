# Stripe Connect deposits and payouts foundation

This repository contains a minimal Node.js application that bootstraps a secure deposits and payouts foundation with **Stripe Connect Express**.

It is intentionally small and production-conscious:
- it creates Stripe Connect Express accounts,
- sends users into **Stripe-hosted onboarding** with Account Links,
- allows an operator to request a payout-oriented **transfer** only after checking connected-account readiness,
- verifies Stripe webhooks, and
- **never** asks for or stores Bank of America credentials or raw bank account numbers.

> **Bank of America support**: this project represents Bank of America as a supported bank institution only through Stripe's hosted onboarding and external account verification flow. The app does not directly integrate with Bank of America, does not verify bank accounts locally, and does not collect usernames, passwords, routing numbers, or account numbers.

## Project structure

- `src/app.js` - Express app and routes
- `src/config.js` - environment/config parsing
- `src/stripeService.js` - Stripe client wrapper for easy mocking
- `src/validation.js` - request and account-readiness validation
- `public/index.html` - small operator UI
- `test/*.test.js` - validation and route tests using mocks

## Requirements

- Node.js 18+
- A Stripe account with Connect enabled
- Stripe CLI (recommended for local webhook testing)

## Environment variables

Copy `.env.example` to `.env` and replace placeholder values.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Local server port. Defaults to `3000`. |
| `APP_BASE_URL` | Yes | Public base URL used for Stripe account-link return/refresh URLs, for example `http://localhost:3000`. |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key for your platform account. Use a test key in development. |
| `STRIPE_WEBHOOK_SECRET` | For webhook verification | Stripe webhook signing secret. |
| `SUPPORTED_PAYOUT_CURRENCIES` | No | Comma-separated allowlist of payout transfer currencies. Defaults to `usd`. |

## Install and run

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000` for the operator UI.

## Test

```bash
npm test
```

Tests use mocked Stripe-service behavior only. They do **not** call Stripe's live API.

## API overview

### 1. Create a connected account and onboarding link

`POST /api/connect/accounts`

```json
{
  "email": "seller@example.com",
  "country": "US"
}
```

Response:

```json
{
  "accountId": "acct_123",
  "onboardingUrl": "https://connect.stripe.com/...",
  "expiresAt": 1234567890
}
```

Use the returned `onboardingUrl` to send the recipient/seller into Stripe-hosted onboarding. That is where Stripe collects and verifies bank account information.

### 2. Request a payout-oriented transfer

`POST /api/payouts`

```json
{
  "connectedAccountId": "acct_123",
  "amount": 2500,
  "currency": "usd"
}
```

The endpoint:
- validates the Stripe account ID, amount, and currency,
- rejects raw bank fields if they are supplied,
- retrieves the connected account from Stripe,
- checks `details_submitted`, `payouts_enabled`, and the `transfers` capability,
- creates a Stripe **transfer** to the connected account only when the account is ready.

> This foundation creates a transfer to the connected Stripe account. Final payout timing to the seller's Bank of America account remains controlled by Stripe and the connected account's payout settings.

### 3. Stripe webhook handler

`POST /api/webhooks/stripe`

Relevant events to send here include:
- `account.updated`
- `capability.updated`
- `payout.created`
- `payout.failed`
- `payout.paid`

The current handler verifies the Stripe signature and returns a placeholder response. Before live money movement, add application-specific persistence, reconciliation, alerting, and retry logic.

## Local webhook setup

Example with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Then place the generated signing secret into `STRIPE_WEBHOOK_SECRET`.

## Stripe Connect configuration notes

- Use **Connect Express** on your Stripe platform account.
- Ensure the connected account can request and activate the capabilities you require for payouts/transfers.
- Maintain sufficient platform balance if you create transfers from the platform to connected accounts.
- For production, review Stripe's requirements for KYC, payout schedules, reserves, negative balance handling, and country/currency support.

## Security limitations and production follow-ups

This repository is an **initial foundation**, not a complete money-movement product. Before processing live funds, add at least:
- authenticated operator access and authorization,
- persistence for users/accounts/transfers/webhook events,
- idempotency keys and duplicate-request protection,
- reconciliation and ledgering,
- sanctions/fraud/risk/compliance workflows,
- audit logging with sensitive-data redaction,
- monitoring/alerting and incident response,
- deployment hardening and secret management.

## Bank of America handling summary

- Bank of America is presented only as a bank the user may connect through Stripe's supported onboarding flow.
- This app does **not** directly connect to Bank of America APIs.
- This app does **not** collect Bank of America usernames, passwords, account numbers, routing numbers, or other raw credentials.
- Stripe controls bank verification and external account onboarding.
