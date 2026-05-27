const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

/*
 * API endpoint patterns to track.
 * Use * as a wildcard for a single path segment (e.g. an order ID).
 * Format: "METHOD /path" or just "/path" (matches any method).
 */
const API_PATTERNS = [
  'POST /v2/checkout/orders',
  'GET /v2/checkout/orders/*',
  'POST /v2/checkout/orders/*/capture',
  'POST /v2/payments/captures/*/refund',
  'GET /v2/payments/captures/*',
  'POST /v2/payments/find-eligible-methods',
  'POST /v1/billing/subscriptions',
  'GET /v1/reporting/transactions',
  'GET /v1/customer/disputes',
  'GET /v1/customer/disputes/*',
  'POST /v2/checkout/orders/*/confirm-payment-source',
  'GET /v3/vault/payment-tokens/*',
  'POST /v3/vault/setup-tokens',
  'GET /v2/payments/refunds/*',
];

app.get('/api/patterns', (req, res) => {
  res.json(API_PATTERNS);
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch (e) {
    console.log('Could not auto-open browser. Please navigate manually.');
  }
});
