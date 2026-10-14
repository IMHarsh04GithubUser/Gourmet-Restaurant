# Existing project and database notes

This archive preserves the React + Node + MongoDB architecture and the three project folders. Validate it against a separate database first. No original hosted MongoDB connection was used during development.

## Preserved data

- User collection/model: `Employees` / `employees`.
- Admin menu collection/model: `AddCategory` / `addcategories`.
- Reservation and contact-message model names are preserved.
- Original menu and grocery image assets remain in the source. Original legacy upload files are retained.
- Old `CartBill` bills remain in their original collection. The `models/Payment.js` schema is retained as a reference, but the old API cannot create new unverified bills.

## New order collection

Secure orders use `orders`. Older bills cannot safely be turned into verified paid orders: they have no authenticated owner, trusted quantities, gateway identifiers or verified amount. Do not automatically set them to Paid. Review or export them separately if historical reporting is needed. They are not displayed as new secure orders.

The customer and admin interfaces must both be upgraded with the API. Old clients calling `/cartbill` get an explicit refresh instruction.

## User records and indexes

New email addresses are lowercased and unique. Old registrations did not enforce this reliably. Before switching an existing database, check for duplicate emails and inconsistent casing. Resolve duplicates with the account owners, then normalise the retained record's email. The API waits for required unique indexes at startup and will fail if existing duplicates prevent index creation. It does not silently delete or merge accounts.

Existing bcrypt hashes remain compatible with bcryptjs. Existing passwords still need to be valid; the old bug allowed the wrong password to pass. An existing account promoted by `create-admin` keeps its existing password. Set up a separate admin with a known strong password if necessary. Existing JWTs are not migrated: sign in again with the new version.

## Menu seeding

The 60 original static dishes are inserted with unique `seedKey` values. The seed script is safe to repeat and does not reset edited fields or availability. Existing admin-added dishes that happen to have similar names are not merged automatically; review them in Menu management and hide duplicates as appropriate. The original menu had two differently priced Caprese Salad entries; both were retained, each with its own product ID.

Hidden dishes remain in the database so that historical order snapshots and images stay intact. A dish hidden during browsing is rejected at the next checkout quote.

## Secrets, files and deployment

The supplied ZIP included a real backend `.env` and a Git directory. Neither is redistributed in this updated archive. Use your existing credentials locally as appropriate; generate a new signing secret with setup. If the original ZIP or repository was shared publicly, rotate any exposed database/mail credentials.

The original oversized `node_modules`, Vite cache and Git history are excluded. Reinstall the exact dependencies with `npm run setup`. Unused old components, duplicate contexts, unused gateway packages and plaintext message logs are excluded. The old README templates are replaced with project-specific setup notes.

Backend local uploads require a persistent disk. The old backend Vercel configuration was removed because a function's temporary filesystem does not provide durable image uploads. Frontend static hosting remains supported with SPA fallback.

## Known scope

- This is one restaurant with one delivery-fee setting. Delivery radius, tax invoices, stock inventory, discount codes and automatic delivery assignment are not implemented.
- Reservations are requests awaiting manual confirmation; there is no automatic table-capacity allocation.
- Authentication uses short-lived bearer tokens in tab-scoped sessionStorage; sign-out clears the local session. Server-wide token revocation, password recovery and third-party social sign-in are not implemented.
- The quiz is a food activity; the gallery does not provide a real prize-redemption programme.
- Rate limits are local to one API process. A multi-instance production setup needs a shared store for rate limits.
