# Razorpay setup and verification

The integration is implemented, but merchant credentials are intentionally blank. Use your own Razorpay account. Start in **Test Mode**. No real payment was taken during development.

## 1. Configure the API

Generate Test Mode API credentials in your Razorpay dashboard. Put the Key ID and Key Secret in `RestBackend/.env`:

```dotenv
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_OWN_RANDOM_WEBHOOK_SECRET
```

Restart the API. Checkout will now offer Pay online and show a Test mode label. With blank keys, COD still works and the online option is unavailable. Do not put any secret in a frontend `.env` or a Git commit. The frontend obtains the public Key ID from the authenticated checkout response.

Use Razorpay's dashboard payment-capture setting to capture payments automatically. An authorised but uncaptured payment remains pending in this app. It must not be used to start fulfilment.

## 2. Set up webhooks

Use an HTTPS endpoint that Razorpay can reach:

```text
https://YOUR_API_HOST/api/payments/webhook
```

For development, expose your local API using a tunnel you control and configure its public HTTPS URL. Plain localhost is not reachable by Razorpay. A return/callback URL is different from this webhook URL.

Set the webhook secret in the dashboard to the same value as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:

- `payment.captured`
- `payment.failed`
- `order.paid`
- `refund.processed`

The API validates the HMAC signature using the exact raw request bytes. It matches the stored gateway order, amount and currency. Duplicate captured webhooks are safe, and delayed failure events cannot overwrite a settled payment. Keep the webhook secret stable while older events may retry; secret-rotation overlap requires additional key-version handling.

## 3. How checkout works

1. The browser submits product IDs and quantities for a server quote.
2. The API fetches available products, calculates prices in integer paise and adds the configured delivery fee.
3. A signed-in customer submits delivery details, the reviewed total and an idempotency reference. Reusing the reference with the same payload returns the same order; a changed payload is rejected.
4. For Razorpay, the API first saves the local order and then creates a matching gateway order. The backend returns the public key ID, gateway order ID, currency and amount.
5. Razorpay opens its hosted checkout. The customer website does not handle or store card details.
6. After the checkout response, the backend checks its signature and fetches the payment from Razorpay. Only a captured payment with the right order, amount and currency confirms the order.
7. A webhook also confirms the order if the customer closes the browser before the handler finishes. My orders → Check payment can reconcile the state from the gateway.

Closing or failing the popup preserves the order and basket. A retry uses the same gateway order. An authorised payment blocks another payment attempt while capture is pending. Do not create a second order to resolve an unclear debit; reconcile first.

## 4. Test with your merchant account

Use the **current test payment details in Razorpay's official documentation**. Available methods depend on your account, device, mode and dashboard configuration; the app does not force a particular payment method.

Check all of these:

- Successful Test Mode payment → My orders shows Paid and Placed.
- Popup dismissed → basket remains; retry does not create a second local order.
- Failed test payment → useful error; order remains retryable.
- Page closed after payment → a captured webhook updates the order.
- Duplicate webhook → no second order and no fulfilment reset.
- Authorised but uncaptured payment → pending, with no preparation action.
- Incorrect signature → rejected; no paid state.
- COD → payment pending until admin confirms cash collection on delivery.
- Refund made in the Razorpay dashboard → Check payment or `refund.processed` updates the refund amount/status.

## 5. Live payments

After your Razorpay account is activated and your own Test Mode checks pass, replace the test credentials with Live Mode keys, configure the corresponding live webhook, and restart the API. Use HTTPS for both websites and API. Confirm your actual delivery/service policy and contact information before accepting real customer orders.

There is no built-in refund initiation API. Refunds are initiated in the merchant dashboard and then synchronised. A fully refunded, undelivered order can then be cancelled from admin. Payment reconciliation only updates confirmed gateway facts; an admin cannot manually mark an online order paid.

If gateway order creation times out after the API has saved an order, its gateway state is `review_required`. This fails closed to avoid blind duplicate gateway creation. Check the merchant dashboard using the local order ID stored as the receipt / `localOrderId` note. A matching captured webhook can recover its mapping. This rare uncertain case needs operator review; it is not represented as a successful payment.

## Primary references

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/webhooks/validate-test/
- https://razorpay.com/docs/webhooks/payments/

The local automated tests use a mocked gateway response. Live Razorpay Checkout, actual merchant credentials, bank authorisation and real webhook delivery still require your account-level test.
