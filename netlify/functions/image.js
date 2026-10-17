// Genera imágenes con Cloudflare Workers AI (plan gratuito, sin tarjeta).
// Variables de entorno en Netlify: CF_ACCOUNT_ID y CF_API_TOKEN (permiso "Workers AI").
const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const LIMIT = 8, WINDOW_MS = 60 * 60 * 1000; // por IP y por hora (mejor esfuerzo: la memoria no se comparte entre instancias)
const hits = new Map();

// ---- Límite de uso por persona (se cuenta en Supabase con la sesión de quien pregunta) ----
const SB_URL_DEFAULT = "https://gqsqjrqholfowvidupmk.supabase.co", SB_KEY_DEFAULT = "sb_publishable_eaq_LrViU7bKcBtv2QYoDQ_Xyum-BWK";

async function checkUsage(event, kind, max, what) {
  if (process.env.REQUIRE_LOGIN === "false") return { ok: true };
  const h = event.headers || {};
  const m = String(h.authorization || h.Authorization || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return { status: 401, error: "Iniciá sesión para usar Cironix." };
  const SB_URL = (process.env.SUPABASE_URL || SB_URL_DEFAULT).replace(/\/$/, ""), SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || SB_KEY_DEFAULT;
  let r;
  try {
    r = await fetch(SB_URL + "/rest/v1/rpc/consume_usage", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + m[1], "Content-Type": "application/json" },
      body: JSON.stringify({ p_kind: kind, p_max: max }),
      signal: AbortSignal.timeout(4000)
    });
  } catch (e) { return { ok: true }; } // si Supabase no responde, no cortamos el servicio
  if (r.status === 401 || r.status === 403) return { status: 401, error: "Tu sesión venció. Volvé a iniciar sesión." };
  if (!r.ok) return { ok: true };
  let row = null; try { const j = await r.json(); row = Array.isArray(j) ? j[0] : j; } catch (e) {}
  if (!row) return { ok: true };
  if (!row.allowed) return { status: 429, error: "Llegaste al límite de " + max + " " + what + " por día. Se reinicia a la medianoche (hora de Argentina)." };
  return { ok: true, remaining: row.remaining };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Método no permitido" });
  const acct = (process.env.CF_ACCOUNT_ID || "").trim(), token = (process.env.CF_API_TOKEN || "").trim();
  if (!acct || !token) return resp(500, { error: "Las imágenes todavía no están configuradas." });

  let prompt;
  try { prompt = String(JSON.parse(event.body).prompt || "").trim(); } catch { return resp(400, { error: "Pedido inválido" }); }
  if (prompt.length < 3) return resp(400, { error: "Escribí qué imagen querés." });
  prompt = prompt.slice(0, 500);

  const usage = await checkUsage(event, "image", Math.max(1, parseInt(process.env.LIMIT_IMAGES, 10) || 10), "imágenes");
  if (usage.status) return resp(usage.status, { error: usage.error });

  const ip = (event.headers && (event.headers["cf-connecting-ip"] || event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"])) || "?";
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return resp(429, { error: "Llegaste al límite de imágenes por hora. Probá más tarde." });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);

  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(acct) + "/ai/run/" + MODEL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ prompt, steps: 4 })
    });
    let data = null; try { data = await r.json(); } catch {}
    const image = data && data.result && data.result.image;
    if (r.ok && image) return resp(200, { image, remaining: usage.remaining });
    const msg = JSON.stringify((data && data.errors) || "").toLowerCase();
    if (r.status === 429 || msg.includes("limit") || msg.includes("quota") || msg.includes("neurons")) return resp(429, { error: "Se acabó el cupo gratuito de imágenes de hoy. Probá mañana." });
    if (r.status === 401 || r.status === 403) return resp(502, { error: "Las imágenes no están disponibles por un problema de configuración." });
    if (msg.includes("nsfw") || msg.includes("flagged")) return resp(422, { error: "No se pudo crear esa imagen. Probá con otra descripción." });
    return resp(502, { error: "No se pudo crear la imagen. Probá de nuevo." });
  } catch (e) {
    return resp(502, { error: "No se pudo crear la imagen. Probá de nuevo." });
  }
};

function resp(status, obj) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
