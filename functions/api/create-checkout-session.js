// POST /api/create-checkout-session
// Body: { room_slug, start, end, guests, guest_name, guest_email }
// Creates a 15-minute hold and a Stripe Checkout session

import Stripe from "stripe";

export async function onRequestPost(ctx) {
  const { env } = ctx;
  const DB = env.DB;
  const origin = env.CORS_ORIGIN || "*";
  const body = await ctx.request.json().catch(() => ({}));
  const { room_slug, start, end, guests, guest_name, guest_email } = body;

  try {
    if (!room_slug || !start || !end || !guest_email) {
      return json({ error: "Missing fields" }, 400, origin);
    }

    const nights = daysBetween(start, end);
    if (nights <= 0) {
      return json({ error: "End date must be after start date" }, 400, origin);
    }

    // Look up room type
    const roomRes = await DB.prepare(
      "SELECT * FROM rooms WHERE slug = ? AND is_active = 1"
    ).bind(room_slug).all();
    const room = roomRes.results?.[0];
    if (!room) return json({ error: "Room type not found" }, 404, origin);

    // Count used units for the range (paid + active holds)
    const usedPaid = await DB.prepare(`
        SELECT COUNT(*) AS cnt FROM bookings
        WHERE room_id = ?
          AND status = 'paid'
          AND date(start_date) < date(?)
          AND date(end_date)   > date(?)
      `).bind(room.id, end, start).all();

    const usedHolds = await DB.prepare(`
        SELECT COUNT(*) AS cnt FROM booking_holds
        WHERE room_id = ?
          AND datetime(expires_at) > datetime('now')
          AND date(start_date) < date(?)
          AND date(end_date)   > date(?)
      `).bind(room.id, end, start).all();

    const used = (usedPaid.results?.[0]?.cnt || 0) + (usedHolds.results?.[0]?.cnt || 0);
    if (used >= room.total_units) {
      return json({ error: "Room type not available for these dates" }, 409, origin);
    }

    // Create a 15-minute hold
    const hold = await DB.prepare(`
        INSERT INTO booking_holds (room_id, start_date, end_date, expires_at)
        VALUES (?, ?, ?, datetime('now', '+15 minutes'))
      `).bind(room.id, start, end).run();

    // Compute amount in kuruş
    const amount_try = room.price_per_night_try * nights;

    // Stripe in Workers runtime
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2022-11-15"
    });

    const webBase = env.WEB_BASE || env.CORS_ORIGIN || "https://taksim-blue.com";
    const successUrl = `${webBase}/thanks.html?status=success`;
    const cancelUrl  = `${webBase}/booking.html?status=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: guest_email,
      billing_address_collection: "required",
      locale: "tr",
      line_items: [{
        price_data: {
          currency: "try",
          unit_amount: amount_try,
          product_data: {
            name: `${room.name} — ${nights} gece`,
            description: `Tarih: ${start} → ${end}`
          }
        },
        quantity: 1
      }],
      metadata: {
        room_id: String(room.id),
        start, end,
        guest_name: guest_name || "",
        guests: String(guests || 1)
      }
    });

    // Record pending booking
    await DB.prepare(`
        INSERT INTO bookings (room_id, start_date, end_date, guest_name, guest_email, guests_count, status, stripe_session_id)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).bind(room.id, start, end, guest_name || "", guest_email, guests || 1, session.id).run();

    return json({ checkout_url: session.url, session_id: session.id }, 200, origin);


  } catch (err) {
    // If Stripe creation failed after we inserted a hold, clean it up
    try {
      await ctx.env.DB.prepare(`
        DELETE FROM booking_holds
        WHERE room_id = ?
          AND start_date = ?
          AND end_date = ?
          AND datetime(expires_at) > datetime('now')
      `).bind(
        // room_id may be undefined if failure happened earlier; guard with OR NULL
        (typeof room !== "undefined" ? room.id : null),
        start, end
      ).run();
    } catch (_) {}
    return json({ error: String(err) }, 500, origin);
  }
}

function daysBetween(a, b) {
  const d1 = new Date(a + "T00:00:00Z");
  const d2 = new Date(b + "T00:00:00Z");
  return Math.round((d2 - d1) / 86400000);
}

function json(payload, status = 200, origin = "*") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin }
  });
}
