# Verification and manual checks

Verified on 14 October 2026 using Node.js 24 in an isolated local environment. No original customer database was accessed and no real payment or email was sent.

## Automated verification

| Check | Result |
|---|---|
| Customer production build | Passed |
| Admin production build | Passed |
| API/security integration suite | 23 tests passed |
| Customer + admin browser workflows | Passed |
| Desktop 1440 px, tablet 768 px, mobile 390 px | Checked; no document-level horizontal overflow |
| Browser runtime exceptions | None in tested flows |
| Broken loaded menu images | None in tested menu |
| Backend production dependency audit | 0 known vulnerabilities in the audit at verification time |

The API suite starts a disposable real MongoDB instance. Gateway API responses are mocked so that test runs cannot charge money. Browser checkout tests use a simulated Razorpay popup and the same server signature-verification flow. An actual Razorpay merchant Test Mode transaction and real webhook delivery were **not** performed because merchant credentials were not supplied.

Run from the project root:

```bash
npm test
npm run build
```

On the first test run, `mongodb-memory-server` may download a MongoDB binary and needs network access. Its database is created in a temporary test directory inside `RestBackend/tests` and removed after the suite. The suite never reads your `.env` connection string.

### API/security scenarios

- Registration validation and client admin-role injection rejection.
- Correct-password acceptance and wrong-password rejection.
- Admin permission checks, including authenticated customers.
- Price tampering and invalid quantities.
- Simultaneous repeated COD submissions create a single order.
- An idempotency reference cannot be reused for a changed cart/address.
- One customer cannot read another customer's order.
- COD fulfilment transitions require cash confirmation before delivery.
- Razorpay retries reuse the stored gateway order.
- Incorrect signatures, wrong ownership and mismatched payment amounts are rejected.
- Authorised payments remain pending and block another payment attempt.
- Captured payments confirm an order.
- Duplicate captured and late failed webhooks cannot reset a paid/preparing order.
- Raw Unicode webhook signatures are checked against unchanged bytes.
- Refund state is synchronised without stale-event downgrades.
- Fully refunded orders can be cancelled without changing their payment facts.
- Hidden products cannot enter a new checkout, while prior orders remain readable.
- Reservations work without SMTP and reject past dates.
- Disguised non-image uploads are rejected.
- Quiz scores are calculated on the server and replays return the saved score.
- The old unverified checkout endpoint is disabled; unlisted CORS origins fail.
- Missing gateway configuration leaves COD working and disables online payments.

## Hands-on checklist

| Where | Action | Expected result |
|---|---|---|
| Customer menu | Search `Paneer-Tikka`, use category and price sort | Matching dishes; stable price ordering |
| Basket | Add the same dish twice, refresh, decrease once | One grouped item; quantity persists and updates |
| Account | Sign up, sign out, enter a wrong password, then correct password | Clear validation; wrong login rejected; correct login succeeds |
| Checkout | Edit address, enter phone, select COD | Server-reviewed total; successful order and cleared basket |
| Checkout | Leave required fields empty | Submit blocked with field validation |
| Checkout | Set your Razorpay Test Mode keys and pay | Hosted popup; server confirmation; Paid order |
| Checkout | Close popup, then retry | Cart remains; same pending order reused |
| My orders | Refresh or Check payment | Latest owned order/payment state; no other customers' orders |
| Admin login | Try a customer account | Admin access rejected |
| Admin menu | Add a dish with photo, then hide it | Customer catalogue reflects both changes |
| Admin orders | Prepare → send → deliver a COD order | Delivery requires cash checkbox; payment becomes Paid |
| Admin orders | Try to prepare an unpaid online order | No available preparation action; server also rejects it |
| Reservation | Submit tomorrow's date and a valid time | Request saved; does not pretend availability is already confirmed |
| Admin requests | Confirm that reservation | Status becomes Confirmed; optional email if configured |
| Contact | Submit a message | Confirmation to customer and message in admin |
| Garden Club | Complete the food quiz | Server score and public display-name leaderboard |
| Mobile | Open menu toggle, browse dishes, open basket | Navigation works; page fits the viewport |

Before live use, follow `PAYMENT_SETUP.md` with your own merchant test credentials. Database access, SMTP delivery, actual Razorpay payment-method availability and hosting configuration depend on your own accounts and environment.
