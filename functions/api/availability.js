// GET /api/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns per-type availability using capacity (total_units - used)

export async function onRequestGet(ctx) {
  const { env } = ctx;
  const DB = env.DB;         // <- D1 binding is on ctx.env
  const url = new URL(ctx.request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const origin = env.CORS_ORIGIN || "*";

  if (!start || !end) {
    return json({ error: "Missing start or end" }, 400, origin);
  }

  // Count overlapping paid bookings per room type
  const bookedCounts = await DB
    .prepare(`
      SELECT r.id AS room_id, COUNT(*) AS cnt
      FROM rooms r
      JOIN bookings b ON b.room_id = r.id
      WHERE b.status = 'paid'
        AND date(b.start_date) < date(?)
        AND date(b.end_date)   > date(?)
      GROUP BY r.id
    `)
    .bind(end, start)
    .all();

  // Count overlapping active holds per room type
  const holdCounts = await DB
    .prepare(`
      SELECT r.id AS room_id, COUNT(*) AS cnt
      FROM rooms r
      JOIN booking_holds h ON h.room_id = r.id
      WHERE datetime(h.expires_at) > datetime('now')
        AND date(h.start_date) < date(?)
        AND date(h.end_date)   > date(?)
      GROUP BY r.id
    `)
    .bind(end, start)
    .all();

  const bookedMap = Object.fromEntries((bookedCounts.results || []).map(r => [r.room_id, r.cnt]));
  const holdMap   = Object.fromEntries((holdCounts.results   || []).map(r => [r.room_id, r.cnt]));

  const roomsRes = await DB.prepare("SELECT * FROM rooms WHERE is_active = 1 ORDER BY id").all();

  const data = (roomsRes.results || []).map(r => {
    const used = (bookedMap[r.id] || 0) + (holdMap[r.id] || 0);
    const remaining = Math.max(0, r.total_units - used);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      max_guests: r.max_guests,
      price_per_night_try: r.price_per_night_try,
      total_units: r.total_units,
      remaining_units: remaining,
      available: remaining > 0
    };
  });

  return json({ start, end, rooms: data }, 200, origin);
}

function json(payload, status = 200, origin = "*") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin }
  });
}
