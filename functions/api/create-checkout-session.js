// POST /api/create-checkout-session
// Body: { room_slug, start, end, guests, guest_name, guest_email }
// Creates a 15-minute hold and a Stripe Checkout session

import Stripe from "stripe";

export async function onRequestPost(ctx) {
  const { env } = ctx;
  const DB = env.DB;         // <- D1 binding is on ctx.env
  const origin = env.CORS_ORIGIN || "*";
  const body = await ctx.request.json().catch(() => ({}));
  const { room_slug, start, end, guests, guest_name, guest_email } = body;

  if (!room_slug || !start || !end || !guest_email) {
    return json({ error: "Missing fields" }, 400, origin);
  }

  // Look up room type
  const roomRes = await DB
    .prepare("SELECT * FROM rooms WHERE slug = ? AND is_active = 1")
    .bind(room_slug)
    .all();
  const room = roomRes.results?.[0];
  if (!room) return json({ error: "Room type not found" }, 404, origin);

  // Count used units for the range (paid + active holds)
  const usedPaid = await DB
    .prepare(`
      SELECT COUNT(*) AS cnt FROM bookings
      WHERE room_id = ?
        AND status = 'paid'
        AND date(start_date) < date(?)
        AND date(end_date)   > date(?)
    `)
    .bind(room.id, end, start)
    .all();

  const usedHolds = await DB
    .prepare(`
      SELECT COUNT(*) AS cnt FROM booking_holds
      WHERE room_id = ?
        AND datetime(expires_at) > datetime('now')
        AND date(start_date) < date(?)
        AND date(end_date)   > date(?)
    `)
    .bind(room.id, end, start)
    .all();

  const used = (usedPaid.results?.[0]?.cnt || 0) + (usedHolds.results?.[0]?.cnt || 0);
  if (used >= room.total_units) {
    return json({ error: "Room type not available for these dates" }, 409, origin);
  }

  // Create a 15-minute hold
  await DB
    .prepare(`
      INSERT INTO booking_holds (room_id, start_date, end_date, expires_at)
      VALUES (?, ?, ?, datetime('now', '+15 minutes'))
    `)
    .bind(room.id, start, end)
    .run();

  // Compute amount
  const nights = Math.max(1, daysBetween(start, end));
  const amount_try = room.price_per_night_try * nights; // in kuruş (TRY)

  // Stripe in Workers runtime
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2022-11-15"
  });

  const successUrl = `${getOrigin(ctx.request)}/thanks.html?status=success`;
  const cancelUrl  = `${getOrigin(ctx.request)}/booking.html?status=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: guest_email,
    line_items: [
      {
        price_data: {
          currency: "try",
          unit_amount: amount_try,
          product_data: {
            name: `${room.name} — ${nights} night(s)`,
            description: `Dates: ${start} → ${end}`
          }
        },
        quantity: 1
      }
    ],
    metadata: {
      room_id: String(room.id),
      start,
      end,
      guest_name: guest_name || "",
      guests: String(guests || 1)
    }
  });

  // Record pending booking (optional but handy for admin)
  await DB
    .prepare(`
      INSERT INTO bookings (room_id, start_date, end_date, guest_name, guest_email, guests_count, status, stripe_session_id)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `)
    .bind(room.id, start, end, guest_name || "", guest_email, guests || 1, session.id)
    .run();

  return json({ checkout_url: session.url }, 200, origin);
}

function daysBetween(a, b) {
  const d1 = new Date(a + "T00:00:00Z");
  const d2 = new Date(b + "T00:00:00Z");
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getOrigin(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

function json(payload, status = 200, origin = "*") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin }
  });
}
