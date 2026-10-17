// Adapta los handlers estilo Netlify (netlify/functions/*.js) a Cloudflare Pages Functions.
export function wrap(mod) {
  const handler = (mod && mod.handler) || (mod && mod.default && mod.default.handler);
  return async function onRequest(ctx) {
    if (typeof globalThis.process === "undefined") globalThis.process = { env: {} };
    if (!globalThis.process.env) globalThis.process.env = {};
    for (const k in ctx.env) if (typeof ctx.env[k] === "string") globalThis.process.env[k] = ctx.env[k];
    const req = ctx.request, headers = {};
    req.headers.forEach(function (v, k) { headers[k] = v; });
    const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
    const r = await handler({ httpMethod: req.method, headers: headers, body: body });
    return new Response(r.body, { status: r.statusCode, headers: r.headers });
  };
}
