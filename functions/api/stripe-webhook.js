// POST /api/stripe-webhook
// Stripe sends checkout.session.completed here; we mark booking as paid and release the hold.

import Stripe from "stripe";

export async function onRequestPost(ctx) {
  const { DB, env } = ctx;
  const sig = ctx.request.headers.get("stripe-signature");
  const rawBody = await ctx.request.text();

  let event;
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2022-11-15"
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { room_id, start, end } = session.metadata || {};

    // Confirm the booking
    await DB
      .prepare(`UPDATE bookings SET status = 'paid' WHERE stripe_session_id = ?`)
      .bind(session.id)
      .run();

    // Release matching hold (same room_id + exact dates)
    if (room_id && start && end) {
      await DB
        .prepare(`
          DELETE FROM booking_holds
          WHERE room_id = ?
            AND date(start_date) = date(?)
            AND date(end_date)   = date(?)
        `)
        .bind(Number(room_id), start, end)
        .run();
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" }
  });
}
