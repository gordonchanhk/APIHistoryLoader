# PayPal Order Type

* A PayPal Order is a payemnt request data object, defining which payment source (by default: paypal) the PayPal Order would store the data for. example: paypal / card / applepay / googlepay / various apm etc)


# PayPal Order Intent

2 Types of PayPal Order intent:

* intent:CAPTURE
    * We call it `Order-Cap`.
    * When a PayPal Order is created, payer APPROVE the order so its status turn APPROVED
    * Merchant needs to make a Order Capture API call (/v2/checkout/orders/{order id}/capture) so either:
        * Failed with reason (non 200/201 response, with `details.issue` and `details.description` describe the fail reason), or;
        * Success (200/201 response code) contains payment capture data (in purchase_units[0].payments.captures). 
        * This payment capture data has:
            * `id` as capture-transaction id;
            `status` as the capture status, which could be PENDING / COMPLETED upon capture, or DENIED if the order being PayPal-Risk reviewed and denied.
            * For capture with PENDING status, it will have `status_details.reason`. The reason could be ECHECK or PENDING_REVIEW.
            * This type of PENDING order will have async webhook to notify the related PayPal order capture result. From API History perspective, such order status will be stay in capture pending.
    * In most case, Create Order API call (POST /v2/checkout/orders) create a PayPal Order in PAYER_ACTION_REQUIRED status, indicate such order is waiting buyer for approval. But for payment_source = "card", or the order with payment_source = "paypal" and with `payment_source.paypal.vault_id` (i.e. created with Payment Method Token), since funding info is obtained upon making the Create Order API, the API response would contains purchase_units[0].payments.captures info.
    * Drop-off: If order with intent:CAPTURE has no subsequent Order Capture, this means the order is dropped-off.
    * Auth-rate: For a given PayPal Order with capture performed, how many of them capture COMPLETED vs How many of them got PENDING or failed with error would be the Auth-rate.

* intent:AUTHORIZE
    * We call it `Order-Auth-Cap`
    * PayPal order is created with `POST /v2/checkout/orders`, then perform Order Authorize `POST /v2/checkout/orders/{order id}/authorize` to create an authorization transaction record (`purchase_units[0].payments.authorizations`), with `id`, `status` and `status_details.reason` for fail cases.
    * Drop-off: If such order with intent:AUTHORIZE has no subsequent Order Authorize, this means the order is dropped-off.
    * For order with intent:AUTHORIZE has subsequent Order Authorize, it will then either:
        * Receive non 200/201 error, e.g. 422 Response code with `details.issue` like INSTRUMENT_DECLINED / PAYER_CANNOT_PAY
        * Receive 200/201 response, with authorization detail in `purchase_units[0].payments.authorization`. Which contains `status` for the authorzation status and `status_details.reason` for the pending reason
    * For Such order intent:AUTHORIZE, merchant need to further perform Capture to the authozation transaction id (`POST /v2/payments/authorizations/{authorization transaction id}/capture`)
    * Auth-rate: For a given order that performed order authorize, how many of them is done with an authorization data with status is COMPLETED vs how many of them got PENDING or DECLINED or failed with error, will be the Auth-rate
    * For order with intent:AUTHORIZE, we have a new figure of: for the given authorization-transaction, how many of them CAPTURE complete and how many fail, it should for a new CAPTURE success / fail analysis.
