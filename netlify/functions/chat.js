const MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile"
];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Método no permitido" });
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) return resp(500, { error: "Falta configurar GROQ_API_KEY en Netlify." });

  let messages;
  try { messages = JSON.parse(event.body).messages; } catch { return resp(400, { error: "Pedido inválido" }); }
  if (!Array.isArray(messages)) return resp(400, { error: "Pedido inválido" });

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
            { role: "system", content: "Sos Cironix, un asistente de IA amable y claro. Respondé en el idioma del usuario, de forma breve y útil." },
            ...clean
          ]
        })
      });
      if (r.status === 429) return resp(429, { error: "Cironix está recibiendo muchos mensajes. Probá de nuevo en un minuto." });
      if (r.ok) {
        const data = await r.json();
        const reply = data.choices?.[0]?.message?.content || "";
        if (reply) return resp(200, { reply });
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
