// Synchronisation des sauvegardes entre appareils (Netlify Functions + Netlify Blobs).
// GET  /api/sync?k=<clé>  → la sauvegarde enregistrée (ou {} si aucune)
// PUT  /api/sync?k=<clé>  → enregistre le corps (JSON, 3 Mo max)
// La clé (20 caractères aléatoires créés par l'appli) sert de mot de passe : sans elle, impossible de lire la sauvegarde.
import { getStore } from "@netlify/blobs";
export default async (req) => {
  const k = new URL(req.url).searchParams.get("k") || "";
  if (!/^[a-z0-9]{16,40}$/.test(k)) return new Response("clé invalide", { status: 400 });
  const store = getStore("pokedex-saves");
  if (req.method === "GET") {
    const v = await store.get(k);
    return new Response(v || "{}", { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > 3e6) return new Response("trop gros", { status: 413 });
    try { JSON.parse(body); } catch (e) { return new Response("JSON invalide", { status: 400 }); }
    await store.set(k, body);
    return new Response("ok", { headers: { "cache-control": "no-store" } });
  }
  return new Response("méthode non permise", { status: 405 });
};
export const config = { path: "/api/sync" };
