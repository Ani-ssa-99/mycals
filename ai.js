// Analyse des repas avec l'API Gemini (gratuite avec une clé Google AI Studio personnelle).
const API = "https://generativelanguage.googleapis.com/v1beta";
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-3-flash", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    plat: { type: "STRING", description: "Nom court du repas en français" },
    aliments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nom: { type: "STRING" },
          grammes: { type: "NUMBER" },
          kcal: { type: "NUMBER" },
          proteines: { type: "NUMBER" },
          glucides: { type: "NUMBER" },
          lipides: { type: "NUMBER" },
          confiance: { type: "STRING", enum: ["faible", "moyenne", "elevee"] },
        },
        required: ["nom", "grammes", "kcal", "proteines", "glucides", "lipides", "confiance"],
      },
    },
    remarque: { type: "STRING", description: "Conseil court ou précision utile, en français" },
  },
  required: ["plat", "aliments"],
};

const PROMPT = `Tu es un nutritionniste expert de la cuisine française et internationale.
Identifie chaque aliment ou composant visible ou décrit (y compris sauces, huile de cuisson, boisson).
Estime la quantité en grammes à partir des indices visuels (taille d'une assiette standard ≈ 26 cm, couverts, mains, emballages).
Pour chaque aliment, donne les calories et macronutriments (protéines, glucides, lipides en grammes) POUR LA QUANTITÉ ESTIMÉE, en te basant sur les tables Ciqual/USDA.
Sois réaliste : ne sous-estime pas les matières grasses cachées. Si l'image ne contient pas de nourriture, renvoie une liste vide.
Réponds uniquement en JSON, en français.`;

async function listModels(key) {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!r.ok) throw await apiError(r);
  const j = await r.json();
  const names = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace(/^models\//, ""));
  const score = n => {
    const m = n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-preview[\w-]*|-latest)?$/);
    if (!m) return -1;
    let s = parseFloat(m[1]) * 10;
    if (m[2]) s -= 5; // lite = plan B
    if (m[3] && m[3].startsWith("-preview")) s -= 2;
    return s;
  };
  const ranked = names.filter(n => score(n) >= 0).sort((a, b) => score(b) - score(a));
  for (const alias of ["gemini-flash-latest", "gemini-flash-lite-latest"]) if (names.includes(alias) && !ranked.includes(alias)) ranked.push(alias);
  return ranked;
}

async function apiError(r) {
  let msg = `Erreur ${r.status}`;
  try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
  const e = new Error(msg); e.status = r.status; return e;
}

export async function testKey(key) {
  const models = await listModels(key);
  if (!models.length) throw new Error("Aucun modèle Gemini compatible trouvé pour cette clé.");
  return models;
}

function humanError(e) {
  if (e.status === 400 && /API key/i.test(e.message)) return "Clé API invalide. Vérifie-la dans Profil.";
  if (e.status === 403) return "Clé API refusée. Vérifie-la dans Profil.";
  if (e.status === 429) return "Quota gratuit atteint pour le moment. Réessaie dans une minute (ou demain).";
  if (e.name === "TypeError") return "Pas de connexion internet.";
  return e.message || "Erreur inconnue";
}

export async function analyzeMeal({ key, models, imageB64, text }) {
  let candidates = [...(models && models.length ? models : []), ...FALLBACK_MODELS].filter((v, i, a) => a.indexOf(v) === i);
  const parts = [{ text: PROMPT + (text ? `\n\nPrécisions de l'utilisateur : ${text}` : "") }];
  if (imageB64) parts.push({ inline_data: { mime_type: "image/jpeg", data: imageB64 } });
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
  };
  let lastErr;
  for (const model of candidates.slice(0, 5)) {
    try {
      const r = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await apiError(r);
        if ([404, 429, 500, 503].includes(e.status)) { lastErr = e; continue; }
        throw e;
      }
      const j = await r.json();
      const txt = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join("");
      if (!txt) { lastErr = new Error("Réponse vide de l'IA. Réessaie avec une photo plus nette."); continue; }
      const data = JSON.parse(txt.replace(/^```(?:json)?|```$/g, "").trim());
      return { ...data, model };
    } catch (e) {
      if (e instanceof SyntaxError) { lastErr = new Error("Réponse illisible de l'IA. Réessaie."); continue; }
      throw new Error(humanError(e));
    }
  }
  throw new Error(humanError(lastErr || new Error("Aucun modèle disponible")));
}

export async function prepareImage(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    // petite vignette pour le journal
    const t = document.createElement("canvas"); const ts = 96 / Math.max(c.width, c.height);
    t.width = Math.round(c.width * ts); t.height = Math.round(c.height * ts);
    t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
    return { b64: dataUrl.split(",")[1], dataUrl, thumb: t.toDataURL("image/jpeg", 0.7) };
  } finally { URL.revokeObjectURL(url); }
}
