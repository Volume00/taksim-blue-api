export const onRequestOptions = async (ctx) => {
  const origin = ctx.env.CORS_ORIGIN || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Stripe-Signature"
    }
  });
};

export const onRequest = async ({ next, env }) => {
  const resp = await next();
  const origin = env.CORS_ORIGIN || "*";
  resp.headers.set("Access-Control-Allow-Origin", origin);
  return resp;
};
