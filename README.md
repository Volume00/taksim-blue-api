# Taksim Blue API (Cloudflare Pages Functions + D1 + Stripe)

Backend for bookings:
- Availability per room **type** with capacity (`total_units`)
- 15-minute **holds** during Stripe checkout
- Stripe Checkout + webhook to mark bookings **paid**

## Deploy (quick)

1) **Cloudflare Pages** → Create project → connect this repo
   - Framework preset: **None**
   - Build command: **npm run build**
   - Build output directory: *(leave blank)*

2) **D1 Database**
   - Create D1 DB (e.g., `TaksimBlueDB`)
   - Bind it to the Pages project as **DB** (Settings → Functions → D1 Bindings)
   - Open DB → **Query** → run `schema.sql` (edit prices if needed)

3) **Environment variables** (Settings → Variables)
   - `CORS_ORIGIN` = `https://taksim-blue.com` (or your preview)
   - `TZ` = `Europe/Istanbul`
   - `STRIPE_SECRET_KEY` = your `sk_test_...` (Encrypted)
   - `STRIPE_WEBHOOK_SECRET` = your `whsec_...` (Encrypted)

4) **Stripe**
   - Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://<your-pages-domain>/api/stripe-webhook`
   - Event: `checkout.session.completed`
   - Copy the Signing secret to `STRIPE_WEBHOOK_SECRET`

5) **Frontend**
   - On each room page (Economy/Deluxe/Family), set `<body data-room-slug="economy|deluxe|family">`
   - Paste the room-page script (calls `/api/availability` + `/api/create-checkout-session`)
   - Set `API_BASE` to your Pages domain (or custom subdomain)

## Endpoints

- `GET /api/availability?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `POST /api/create-checkout-session`  
  Body: `{ room_slug, start, end, guests, guest_name, guest_email }`
- `POST /api/stripe-webhook` (Stripe only)

## Notes
- Money stored as **kuruş** to avoid floating-point errors.
- Availability uses capacity: `remaining = total_units - paidBookings - activeHolds`.
- Holds expire automatically after 15 minutes.
