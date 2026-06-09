Evaluation of capture-logic.md

  Your doc correctly captures the happy-path skeleton of both intents. But comparing it against (a) the PayPal Orders v2 lifecycle, (b) the existing code, and (c) general checkout-funnel / payment-performance practice, I see several unhandled or 
  under-specified cases. I'll group them.

  A. Missing lifecycle stages (the funnel has more steps than the doc models)

  1. confirm-payment-source is entirely absent. Your API_PATTERNS and data include POST /v2/checkout/orders/{id}/confirm-payment-source. For cards (3DS/SCA) and most APMs, the real funnel is create → confirm-payment-source → (payer/3DS action) → 
  capture/authorize. An order that created + confirmed but never captured is a different drop-off than create-only, and confirm itself can fail (e.g. declines, 3DS contingencies). The doc treats the funnel as create→capture only.
  2. Buyer approval vs. merchant capture are conflated. The doc says "intent:CAPTURE with no subsequent capture = dropped off." But that bucket mixes two very different things:
    - Order stuck in PAYER_ACTION_REQUIRED → buyer abandoned at PayPal (merchant can't capture).
    - Order reached APPROVED → merchant failed to capture (actionable by merchant).

  Treating these as one number hides the most useful signal. You can distinguish them via the order status in the create response / later GET (PAYER_ACTION_REQUIRED / APPROVED / COMPLETED).
  3. Inline AUTHORIZE on create is not handled. The doc notes card/vaulted-paypal return captures inline on create (correct), but the symmetric case — an intent:AUTHORIZE order with card/vault returning authorizations inline on create — isn't
  mentioned, and the current code's create branch only looks for captures[0], so it misses these.

  B. Auth-rate definition is ambiguous / conflates distinct failures

  4. PENDING is lumped with failure. "COMPLETED vs PENDING or failed" — but PENDING (ECHECK / PENDING_REVIEW) is not a decline; it usually settles successfully via webhook. Counting it as the failure side understates auth-rate. Convention is
  usually: numerator = approved (often COMPLETED, sometimes COMPLETED+PENDING), and PENDING shown as its own slice.
  5. Technical/API errors are mixed with issuer declines. A 422 INSTRUMENT_DECLINED (issuer said no) and a 500/timeout (PayPal/technical) are both "failed" in the current code. For payment-performance these should be separated — issuer decline rate
  ≠ technical error rate. They have different owners and different fixes.
  6. Denominator unit is unspecified. "For a given PayPal Order with capture performed…" — is auth-rate counted per order or per capture transaction? Retries (idempotent re-calls) and partial captures make these diverge. The current code counts
  per-row (per transaction), which can double-count retried orders.

  C. Censoring / data-completeness bias (the classic funnel pitfall — not mentioned at all)

  7. Right-censoring (maturation window). Orders created near the end of the loaded window haven't had time to be captured yet, and async-PENDING captures resolve via webhook outside the data. Both inflate "drop-off" artificially. A thoughtful
  analysis excludes or flags orders newer than some maturation cutoff.
  8. Pagination / partial data. Data comes from the "Load More" bookmarklet. If not all pages are loaded, or the create call predates the window while the capture is inside it (or vice-versa), you get orphan captures and false drop-offs. Worth
  detecting (orphan capture with no matching create) and flagging.

  D. Status enum coverage & finality
  
  9. Incomplete status maps. Authorization lifecycle also has VOIDED (merchant cancelled), EXPIRED (auth lapsed before capture), PARTIALLY_CAPTURED. These matter for the auth→capture stage. Capture DENIED (risk) is covered; refunds/reversals aren't
  (probably out of scope, worth stating).
  10. Latest status not used. Final order state often lives in a later GET /v2/checkout/orders/{id}; the code uses GETs only for payment_source lookup, not to resolve the authoritative final outcome.

  E. Segmentation & presentation

  11. Intents aren't separated. The doc defines two separate funnels but the current UI merges them into one pie. Cleaner: split by intent, and make the auth→capture stage its own section (your line 34 "new figure" — currently auth-captures are
  folded into the main capture pie by payment source).
  12. Payment-source granularity. Your doc itself flags that paypal with vault_id (returning/MIT) behaves differently from interactive paypal. Auth-rates differ wildly between vaulted/MIT and first-time interactive flows, so
  Object.keys(payment_source)[0] alone may be too coarse.
  13. Subscriptions excluded. /v1/billing/subscriptions have their own capture lifecycle and aren't in the orders funnel — worth explicitly scoping out.