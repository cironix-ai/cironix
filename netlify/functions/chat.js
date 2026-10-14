const MODEL = "llama-3.3-70b-versatile";

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

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [
          { role: "system", content: "Sos Cironix, un asistente de IA amable y claro. Respondé en el idioma del usuario, de forma breve y útil." },
          ...clean
        ]
      })
    });
    if (r.status === 429) return resp(429, { error: "Cironix está recibiendo muchos mensajes. Probá de nuevo en un minuto." });
    if (!r.ok) {
      const detail = await r.text();
      return resp(502, { error: "Groq respondió " + r.status + ": " + detail.slice(0, 200) });
    }
    const data = await r.json();
    return resp(200, { reply: data.choices?.[0]?.message?.content || "" });
  } catch (e) {
    return resp(502, { error: "No se pudo conectar con el modelo: " + String(e).slice(0, 150) });
  }
};

function resp(status, obj) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
