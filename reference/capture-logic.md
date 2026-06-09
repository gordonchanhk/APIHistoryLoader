# Capture & Drop-off Analysis Logic

This documents how the **Capture Analysis** and **Drop-off** tools derive their
figures from a merchant's PayPal REST API call history. The goal is to surface
**how healthy the merchant's API-calling behaviour is** — i.e. how many created
orders / calls land in each scenario — not a forensically exact settlement figure.

Implementation: `app/public/index.html` — `buildOrderModel()` (shared pass),
`showDropOff()`, `showCaptureAnalysis()`.

---

## PayPal Order type (payment source)

A PayPal Order is a payment-request object. `payment_source` declares which funding
type the order is for: `paypal` (default), `card`, `apple_pay`, `google_pay`, or
various APMs.

* **Vaulted vs interactive.** A `payment_source.<src>.vault_id` (or
  `attributes.vault`) means a **stored credential** (returning buyer / merchant-
  initiated) rather than an interactive first-time checkout. Acceptance rates differ
  sharply between the two, so the analysis labels them separately,
  e.g. `paypal (vaulted)` vs `paypal`, `card (vaulted)` vs `card`.

## Order intent

The order's `intent` is read from the create call (`api_request.body.intent`, then
`api_response.body.intent`). If absent, it is inferred: an order with any authorize
call is treated as `AUTHORIZE`, otherwise `CAPTURE`.

### intent:CAPTURE — *Order-Cap*

* Create order (`POST /v2/checkout/orders`); buyer approves; merchant calls
  `POST /v2/checkout/orders/{id}/capture`, which either:
  * **fails** (non-2xx, with `details[0].issue` / `description`), or
  * **succeeds** (2xx) with capture data in `purchase_units[0].payments.captures`:
    * `status` = `COMPLETED`, `PENDING`, or `DECLINED`/`DENIED` (risk-reviewed).
    * `PENDING` carries `status_details.reason` (`ECHECK` / `PENDING_REVIEW`) and
      resolves later via **webhook**. The API History log has no webhook data, so
      such orders **stay PENDING here** — we do **not** try to infer the final
      COMPLETED/DENIED state.
* **Inline capture on create.** For `payment_source = card`, or `paypal` with a
  `vault_id` (Payment Method Token), funding is known at create time, so the create
  response already contains `purchase_units[0].payments.captures` (typically
  `COMPLETED`) — no separate capture call.

### intent:AUTHORIZE — *Order-Auth-Cap*

* Create order, then `POST /v2/checkout/orders/{id}/authorize` creates an
  authorization transaction in `purchase_units[0].payments.authorizations`:
  * A **successful** authorization has status **`CREATED`** (funds held) — *not*
    `COMPLETED`. (The order-level status becomes `COMPLETED`.) Other statuses:
    `PENDING`, `DENIED`, `EXPIRED`, `VOIDED`, `CAPTURED`, `PARTIALLY_CAPTURED`.
  * Failure is a non-2xx (e.g. 422 `INSTRUMENT_DECLINED` / `PAYER_CANNOT_PAY`).
  * **Inline authorize on create** is possible for card / vaulted-paypal, mirroring
    inline capture.
* The merchant then captures the authorization:
  `POST /v2/payments/authorizations/{auth_id}/capture` (status at the response top
  level). This is a **distinct stage** — see *Authorization → Capture* below.

---

## Outcome classification (per order, best result wins)

For each order the model keeps the **best** outcome seen across all related calls
(`completed > pending > declined > error`), so a retried order that eventually
succeeds counts as success.

| Outcome    | Capture / Auth-capture                          | Authorize                                   |
|------------|-------------------------------------------------|---------------------------------------------|
| success    | 2xx + `COMPLETED`/`CAPTURED`/`PARTIALLY_CAPTURED`| 2xx + `CREATED`/`CAPTURED`/`PARTIALLY_CAPTURED` (= **authorized**) |
| `pending`  | 2xx + `PENDING`                                 | 2xx + `PENDING`                             |
| `declined` | 2xx + `DECLINED`/`DENIED`, **or** HTTP 422      | 2xx + `DENIED`/`EXPIRED`/`VOIDED`, **or** HTTP 422 |
| `error`    | any other non-2xx (5xx / timeout / 4xx)         | any other non-2xx                           |

`declined` = issuer/risk **decision**; `error` = **technical / integration** fault.
They are reported separately because they have different owners and fixes.

---

## Drop-off analysis (per intent, mutually-exclusive buckets)

Denominator = orders successfully created (`POST /v2/checkout/orders` → 2xx).
Create calls that fail **before an order id exists** are counted separately as
**merchant-introduced create errors** (a created order is normally approved &
captured quickly, so a failed/timed-out create usually signals a merchant bug).

**intent:CAPTURE** buckets:

| Bucket                              | Meaning                                                       |
|-------------------------------------|--------------------------------------------------------------|
| Capture completed                   | best capture outcome = completed (incl. inline / `COMPLETED` order) |
| Capture pending                     | best capture outcome = pending                               |
| Capture failed                      | best capture outcome = declined or error                     |
| Approved, not captured              | order reached `APPROVED` (seen via a `GET`) but no capture — **merchant drop-off** |
| No capture seen — buyer abandon     | no capture and never observed as approved (`CREATED` / `PAYER_ACTION_REQUIRED`) |

> The *approved-not-captured* vs *buyer-abandon* split is only possible when the
> merchant actually made a `GET /v2/checkout/orders/{id}` that returned `APPROVED`.
> Many merchants don't, so where approval is unobservable the order is labelled
> honestly as *buyer abandon / uncaptured* rather than guessed.

**intent:AUTHORIZE** buckets: Authorized & captured · Authorized, capture pending ·
Authorized, capture failed · Authorized, not captured (drop-off) · Authorize
pending · Authorize declined/failed · Approved, not authorized (merchant drop-off) ·
No authorize seen (buyer abandon).

Each bucket is rendered as a proportional **funnel bar** and is click-through to the
underlying create records.

---

## Capture analysis (acceptance / "auth-rate")

Three sections, each broken down by payment source (vaulted/interactive split),
counted **per order** (best outcome):

1. **intent:CAPTURE — capture acceptance** — Completed / Pending / Declined / Error.
2. **intent:AUTHORIZE — authorize acceptance** — Authorized / Pending / Declined / Error.
3. **Authorization → Capture** — of authorization transactions, how many capture
   Completed / Pending / Declined / Error (the auth→capture stage).

Each section reports:
* **Auth-rate** = success / all attempts.
* **Issuer approval** = success / (success + declined) — excludes pending and
  technical errors, isolating the issuer/risk decision.

Below the sections, failures are grouped into two tables: **declined by issuer/risk**
(by `details.issue` / status) and **technical/integration errors** (by issue +
HTTP code). All counts drill through to the matching records; the whole view exports
to CSV.

---

## Out of scope / known limitations

* **`confirm-payment-source`** is not modelled as a funnel stage.
* **Webhooks / PENDING resolution** — no webhook data in the log; PENDING stays
  PENDING.
* **Right-censoring** — no maturation window; recently-created orders are counted
  as-is (a long-unapproved/uncaptured order is treated as drop-off, which is the
  behaviour we want to surface).
* **Multi-purchase-unit orders and partial captures** — only `purchase_units[0]`
  and the first capture/authorization are inspected.
* **Subscriptions / billing** (`/v1/billing/*`) have their own lifecycle and are not
  part of the orders funnel.
* **Orphan transactions** — a capture/authorize whose create call is outside the
  loaded data is excluded from the drop-off denominator; orphan auth-captures are
  still counted in the Authorization → Capture section under `(unknown)` source.
