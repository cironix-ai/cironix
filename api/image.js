// Vercel: adapta el handler estilo Netlify (netlify/functions/image.js) a una función de Vercel.
// Las imágenes usan la API de Cloudflare Workers AI: hacen falta CF_ACCOUNT_ID y CF_API_TOKEN en Vercel.
const { handler } = require("../netlify/functions/image.js");

module.exports = async (req, res) => {
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, headers: req.headers || {}, body });
  res.status(r.statusCode);
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(r.body);
};
