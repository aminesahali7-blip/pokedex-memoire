// Synchronisation des sauvegardes entre appareils (Netlify Functions + Netlify Blobs).
// GET  /api/sync?k=<clé>           → la sauvegarde enregistrée (ou {} si aucune)
// GET  /api/sync?k=<clé>&prev=1    → la version enregistrée juste avant (filet de sécurité)
// PUT  /api/sync?k=<clé>&base=<sv> → enregistre le corps (JSON, 5 Mo max) et renvoie {sv}
// Chaque version reçoit un tampon "sv" donné par l'horloge du SERVEUR. Un envoi indique la version sur laquelle
// l'appareil s'est basé (base) : si une autre version a été enregistrée entre-temps → refus 409 (l'appli propose
// alors de charger la version en ligne). Lecture « strong » (pas de copie périmée) et écriture conditionnelle (ETag) :
// deux envois simultanés ne peuvent pas réussir tous les deux.
// La clé (20 caractères aléatoires créés par l'appli) sert de mot de passe : sans elle, impossible de lire la sauvegarde.
import { getStore } from "@netlify/blobs";
const J = { "content-type": "application/json", "cache-control": "no-store" };
const no = (m, s) => new Response(m, { status: s, headers: { "cache-control": "no-store" } });
export default async (req) => {
  const u = new URL(req.url), k = u.searchParams.get("k") || "";
  if (!/^[a-z0-9]{16,40}$/.test(k)) return no("clé invalide", 400);
  const store = getStore({ name: "pokedex-saves", consistency: "strong" });
  if (req.method === "GET") {
    const v = await store.get(u.searchParams.get("prev") ? k + "_prev" : k);
    return new Response(v || "{}", { headers: J });
  }
  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > 5.5e6) return no("trop gros", 413);
    let o; try { o = JSON.parse(body); } catch (e) { return no("JSON invalide", 400); }
    if (!o || typeof o !== "object" || !o.c || typeof o.c !== "object") return no("sauvegarde invalide", 400);
    const cur = await store.getWithMetadata(k, { type: "text" });
    const old = cur ? cur.data : null;
    let sv0 = 0, ts0 = 0; if (old) { try { const p = JSON.parse(old); sv0 = p.sv || 0; ts0 = p.ts || 0; } catch (e) {} }
    const b = u.searchParams.get("base"), base = Number(b);
    if (b === null) { if (sv0 > 0) return no("conflit", 409); }            // ancienne version de l'appli (sans base)
    else if (sv0 > 0) { if (base !== sv0) return no("conflit", 409); }       // une autre version a été enregistrée entre-temps
    else if (old && ts0 > base + 2000) return no("conflit", 409);             // sauvegarde en ligne d'avant la mise à jour, plus récente
    const sv = Math.max(Date.now(), sv0 + 1); o.sv = sv;
    const w = old ? await store.set(k, JSON.stringify(o), cur.etag ? { onlyIfMatch: cur.etag } : {}) : await store.set(k, JSON.stringify(o), { onlyIfNew: true });
    if (w && w.modified === false) return no("conflit", 409);              // un autre appareil a écrit au même moment
    if (old) await store.set(k + "_prev", old);
    return new Response(JSON.stringify({ sv }), { headers: J });
  }
  return no("méthode non permise", 405);
};
export const config = { path: "/api/sync" };
