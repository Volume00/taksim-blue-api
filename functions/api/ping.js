export async function onRequestGet(ctx) {
  try {
    const DB = ctx.env.DB;
    const q = await DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").all();
    return new Response(JSON.stringify({ ok: true, tables: q.results?.[0]?.n ?? 0 }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
