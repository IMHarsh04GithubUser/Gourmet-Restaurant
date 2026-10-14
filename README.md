# Gourmat Garden

React customer website + React admin panel + Node/Express/MongoDB API. This update connects both websites to one menu, fixes authentication and order totals, adds Razorpay checkout alongside cash on delivery, and refreshes the responsive interface.

## Start here (Windows, macOS or Linux)

Install Node.js 22 LTS or newer and have MongoDB available (local MongoDB Community Server or your Atlas database).

1. Extract this ZIP. Open a terminal **inside the `GourmatGarden` folder**, where this README and the root `package.json` live.
2. Run `npm run setup`. This installs the locked dependencies for all three apps, creates missing `.env` files, and generates a random backend signing secret. Existing `.env` files are preserved.
3. Open `RestBackend/.env`. Set `MONGO_URI` to your database connection string. The local default is `mongodb://127.0.0.1:27017/gourmatgarden`. Set `ADMIN_EMAIL`, `ADMIN_NAME` and a strong `ADMIN_PASSWORD`.
4. Run `npm run seed` to add the 60 original menu dishes. Repeat runs preserve existing seeded dishes and admin edits. Use a fresh database to try the new version before migrating an existing database.
5. Run `npm run create-admin`. A new admin is created; an existing account with that email is promoted without changing its password. Remove `ADMIN_PASSWORD` from `.env` afterwards.
6. Run `npm run dev`.

Open:

| Application | Local address |
|---|---|
| Customer website | http://localhost:5173 |
| Admin panel | http://localhost:5174 |
| API health | http://localhost:3000/api/health |

Customers sign up through the website. Admins use the account created in step 5. There are no hard-coded admin accounts or default passwords. Keep the terminal running while using the project; Ctrl+C stops the apps.

## Payments

COD works without payment keys. Razorpay checkout becomes available after you add your **own test credentials** to `RestBackend/.env` and restart the API:

```dotenv
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_SEPARATE_WEBHOOK_SECRET
```

Only the public key ID is sent to the browser. Never put the secret in a `VITE_` variable, source file, or frontend build.

See **[docs/PAYMENT_SETUP.md](docs/PAYMENT_SETUP.md)** for dashboard setup, webhook configuration, test scenarios, and the step to enable live payments. No merchant account or live keys have been configured in this archive.

## What changed

- Password validation now awaits bcrypt. Registration validates input, hashes passwords, normalises email, and never accepts an admin role from the client. Tokens have an 8-hour expiry; admin APIs enforce the database role.
- A single MongoDB menu powers browsing, cart prices and admin management. Original 60 dishes are available through the idempotent seed script. Admins can add photo-based dishes or hide/show existing dishes.
- Cart quantities are grouped by product ID, with quantity limits and refresh persistence. The account session persists for the current browser tab. Checkout address and phone fields are editable.
- The server calculates integer-paise totals from database prices. Client price fields cannot override the bill. A quote is reviewed before order creation, and changes require confirmation through a refreshed quote.
- Checkout has duplicate-submit protection, server idempotency, COD and Razorpay, signed server verification, captured-payment checks, raw-body webhook verification, and retry/reconciliation from My orders.
- Customers can see their order and payment history. Admins move eligible orders through preparing → out for delivery → delivered. COD delivery requires explicit cash-collection confirmation.
- Reservations are requests pending admin confirmation; availability is not invented. Requests and contact messages are visible in admin. Optional reservation emails cannot break successful database writes.
- Mobile navigation, search, category tabs, sorting, empty/error/loading states, labelled forms, keyboard focus and reduced-motion support replace the earlier inconsistent layouts. Dead social-login and password-reset buttons are removed.
- The food quiz is retained as a food-themed activity with server-scored submissions and a leaderboard. The grocery gallery is retained; unsupported prize promises are removed.
- Route chunks, lazy image loading, cached static assets, lean database reads, database indexes, paginated orders and dependency cleanup reduce unnecessary work.

## Commands

```bash
npm run setup          # Install dependencies and create missing env files
npm run seed           # Add the original menu
npm run create-admin   # Create or promote your configured admin
npm run dev            # Run API + customer site + admin
npm run build          # Production builds for both React apps
npm test               # Isolated API/security integration tests
```

You can also run each app separately with `npm run dev` in its folder. Use `npm start` in `RestBackend` for the API without file watching. The API waits for MongoDB before accepting traffic.

## Project map

| Location | Purpose |
|---|---|
| `Restaurant/src/ui/` | Customer layout, pages, shared cart/auth state, checkout, orders, quiz and styles |
| `Restaurant/src/pages/Grocery/` | Original grocery-gallery data and images |
| `AdminPanel/src/App.jsx` | Admin login, menu management, order workflow, reservations and leaderboard |
| `RestBackend/app.js` | API routes, validation, permissions and payment orchestration |
| `RestBackend/index.js` | Environment loading, MongoDB connection and server lifecycle |
| `RestBackend/lib/` | Authentication, pricing, payment signatures and optional mail services |
| `RestBackend/models/` | Mongoose schemas (original user/menu collections retained) |
| `RestBackend/data/` | Menu seed and server-owned food quiz questions |
| `RestBackend/public/menu/` | Images for the original menu, served by the API |
| `RestBackend/uploads/` | Uploaded menu photos; requires persistent storage when hosted |
| `RestBackend/scripts/` | Menu seeding and admin creation |
| `RestBackend/tests/` | Isolated integration tests using disposable MongoDB and a mocked gateway |
| `scripts/` | Cross-platform setup and development launchers |
| `docs/` | Payment setup, migration notes and verification checklist |

## Existing databases

Read **[docs/MIGRATION.md](docs/MIGRATION.md)** before using an existing database. No existing customer database was contacted during this update. Old unverified bills are preserved in their original collection; new secure orders use a separate collection. The old `/cartbill` endpoint is intentionally disabled.

## Optional email

Set `GMAIL_USER` and a Gmail app password in `GMAIL_PASS` to send reservation request and confirmation notifications. Leave both empty to run without SMTP. Orders remain visible through My orders and the admin panel; there is no dependency on email for checkout success.

## Hosting

Build both frontends and host each `dist` directory with SPA fallback to `index.html`. Set their `VITE_API_URL` **before building** to your HTTPS API URL; set `VITE_CUSTOMER_URL` for admin as well. Set `CLIENT_ORIGINS` on the backend to both exact website origins, comma separated.

Host the API as a persistent Node service with MongoDB and a persistent `RestBackend/uploads` directory. A plain Vercel function is not a suitable drop-in host for local image uploads. A future deployment can move images to object storage. Set reverse-proxy hop count only for a known proxy arrangement. In-memory rate limits are per API process; use a shared limiter before scaling to multiple API instances.

See **[docs/TESTING.md](docs/TESTING.md)** for the verification results and a hands-on test checklist.
