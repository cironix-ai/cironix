// Vercel: adapta el handler estilo Netlify (netlify/functions/chat.js) a una función de Vercel.
const { handler } = require("../netlify/functions/chat.js");

module.exports = async (req, res) => {
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, headers: req.headers || {}, body });
  res.status(r.statusCode);
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(r.body);
};
