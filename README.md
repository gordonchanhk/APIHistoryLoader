# Local REST API Explorer

A standalone local Node.js app for exploring and analyzing PayPal REST API call history. Load one or more exported data files in the browser and get a fully interactive table with detail views, syntax-highlighted JSON, and built-in analysis tools.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)

## Setup

```bash
cd app
npm install
```

## Usage

```bash
npm start
```

The server starts on `http://localhost:3000` and auto-opens your browser.

### Development mode

```bash
npm run dev
```

Uses Node's built-in `--watch` flag (requires Node.js v18.11+) to automatically restart the server when `server.js` changes. Useful when editing API patterns or other server-side config.

### Loading data

1. On the landing page, click **Choose file(s)** to select one or more `.txt` or `.json` files.
2. Each file must contain a JSON array of API call records (the format exported by the PayPal API History tool).
3. If multiple files are selected, their arrays are merged into a single view.

### Data file format

Each file should be a JSON array where each element has this structure:

```json
[
  {
    "create_time": "2026-05-15T09:43:09Z",
    "correlation_id": "69a81334739ca",
    "resource_id": "4GF22761VN086005F",
    "tag_id": [],
    "url": "/v2/checkout/orders",
    "http_status": 200,
    "account_number": "1837167067998953963",
    "client_id": "AZ0-xeGo15L...",
    "api_request": {
      "method": "POST",
      "header": {},
      "body": {}
    },
    "api_response": {
      "status": 200,
      "header": {},
      "body": {},
      "duration_time": "1234"
    }
  }
]
```

## Features

### Table view

- **Sortable columns** -- Timestamp, URL Path, ID, Corr ID, Method, Status. Click any header to sort.
- **Row expand** -- Click the `+` icon to expand inline detail: response time, collapsible request/response headers (toggle via the correlation ID button), and syntax-highlighted JSON bodies.
- **Detail modal** -- Click a URL path to open a full-detail modal showing account number, full client ID, tag ID pills, method/status/timestamp, collapsible headers, user-agent info, and request/response bodies.
- **Status filters** -- Success / Failed / Error toggle buttons filter rows by HTTP status code range (2xx / 4xx / 5xx), with badge counts.
- **JSON search** -- The search box filters rows by matching against the full JSON-stringified record.
- **Copy dropdown** -- Copy formatted data for email/messaging, or copy request-only / response-only bodies.
- **Raw Data toggle** -- Switch between formatted and raw JSON views in the detail modal.
- **Expand / Collapse All** -- Fixed button to expand or collapse all detail rows at once.
- **Timezone support** -- Timestamps are displayed in your browser's local timezone.
- **Multi-file merge** -- Select multiple data files at once; their records are concatenated and displayed together.

### Analysis tools

A toolbar appears after data is loaded with these analysis buttons:

#### Error Analysis

Shows a breakdown of all **422** error responses grouped by `details.issue`:

- Each issue listed with its description, count, and percentage.
- Click any issue row to open a **new window** showing only the matching records with expandable request/response bodies.

#### Endpoint Count

Counts API calls by endpoint pattern, showing total / success / failed counts with percentages:

- Patterns are configured in `server.js` in the `API_PATTERNS` array.
- Uses `*` as a wildcard for a single path segment (e.g. an order ID).
- Unmatched requests are shown in a warning row -- click it to open a **new window** listing those records.

Default patterns included:

```
POST /v2/checkout/orders
GET  /v2/checkout/orders/*
POST /v2/checkout/orders/*/capture
POST /v2/checkout/orders/*/confirm-payment-source
POST /v2/payments/captures/*/refund
GET  /v2/payments/captures/*
GET  /v2/payments/refunds/*
POST /v2/payments/find-eligible-methods
POST /v1/billing/subscriptions
GET  /v1/reporting/transactions
GET  /v1/customer/disputes
GET  /v1/customer/disputes/*
GET  /v3/vault/payment-tokens/*
POST /v3/vault/setup-tokens
```

To add or modify patterns, edit the `API_PATTERNS` array in `server.js` and restart the server.

#### Client IDs

Lists all distinct `client_id` values found in the loaded data:

- Shows total / success / failed call counts with percentages per client ID.
- Sorted by total count descending.
- Click any row to open a **new window** showing that client's records.

## Configuration

| Item | File | Description |
|---|---|---|
| Port | `server.js` | Change `PORT` constant (default: `3000`) |
| API patterns | `server.js` | Edit `API_PATTERNS` array for endpoint count analysis |
