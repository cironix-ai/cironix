const MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile"
];

// ---- Límite de uso por persona (se cuenta en Supabase con la sesión de quien pregunta) ----
const SB_URL = (process.env.SUPABASE_URL || "https://gqsqjrqholfowvidupmk.supabase.co").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_eaq_LrViU7bKcBtv2QYoDQ_Xyum-BWK";

async function checkUsage(event, kind, max, what) {
  if (process.env.REQUIRE_LOGIN === "false") return { ok: true };
  const h = event.headers || {};
  const m = String(h.authorization || h.Authorization || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return { status: 401, error: "Iniciá sesión para usar Cironix." };
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
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) return resp(500, { error: "Falta configurar GROQ_API_KEY en Netlify." });

  let messages;
  try { messages = JSON.parse(event.body).messages; } catch { return resp(400, { error: "Pedido inválido" }); }
  if (!Array.isArray(messages)) return resp(400, { error: "Pedido inválido" });

  const usage = await checkUsage(event, "chat", Math.max(1, parseInt(process.env.LIMIT_CHAT, 10) || 60), "mensajes");
  if (usage.status) return resp(usage.status, { error: usage.error });

  const clean = messages.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 2000)
  }));

  let lastError = "";
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [
            { role: "system", content: "Sos Cironix, un asistente de IA amable y claro. Respondé en el idioma del usuario, de forma breve y útil. Cironix también crea imágenes: si te preguntan si podés o cómo, decí que sí y explicá que pueden escribir, por ejemplo, \"creá una imagen de un gato astronauta\" o tocar el botón de imagen junto a la caja de texto, y que todas las imágenes quedan en la sección Imágenes del panel izquierdo. Nunca dibujes imágenes con texto, ASCII ni código." },
            ...clean
          ]
        })
      });
      if (r.status === 429) return resp(429, { error: "Cironix está recibiendo muchos mensajes. Probá de nuevo en un minuto." });
      if (r.ok) {
        const data = await r.json();
        const reply = data.choices?.[0]?.message?.content || "";
        if (reply) return resp(200, { reply, remaining: usage.remaining });
        lastError = model + ": respuesta vacía";
        continue;
      }
      const detail = await r.text();
      lastError = model + " (" + r.status + "): " + detail.slice(0, 150);
      if (r.status === 404 || r.status === 400) continue;
      break;
    } catch (e) {
      lastError = model + ": " + String(e).slice(0, 100);
    }
  }
  return resp(502, { error: "No se pudo obtener respuesta. " + lastError });
};

function resp(status, obj) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
