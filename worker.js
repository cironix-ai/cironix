// Cloudflare Worker: sirve la web (archivos estáticos) y las rutas /api/chat y /api/image.
import { onRequest as chat } from "./functions/api/chat.js";
import { onRequest as image } from "./functions/api/image.js";

export default {
  async fetch(request, env) {
    const p = new URL(request.url).pathname.replace(/\/$/, "");
    if (p === "/api/chat") return chat({ request, env });
    if (p === "/api/image") return image({ request, env });
    return env.ASSETS.fetch(request);
  }
};
