// Open Food Facts : base de données alimentaire libre et gratuite (pas de clé nécessaire).
const FIELDS = "code,product_name,product_name_fr,generic_name_fr,brands,nutriments,serving_quantity,serving_size,image_front_small_url,image_small_url,nutriscore_grade,quantity";

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

export function fromOFF(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"] ?? n["energy-kcal"]);
  if (!kcal && n.energy_100g) kcal = num(n.energy_100g) / 4.184;
  const name = (p.product_name_fr || p.product_name || p.generic_name_fr || "").trim();
  if (!name && !kcal) return null;
  const brand = Array.isArray(p.brands) ? p.brands.join(", ") : (p.brands || "").split(",")[0].trim();
  const sq = num(p.serving_quantity);
  return {
    id: "off-" + p.code,
    barcode: p.code,
    name: name || "Produit sans nom",
    brand,
    per100: { kcal: Math.round(kcal), p: round1(num(n.proteins_100g)), c: round1(num(n.carbohydrates_100g)), f: round1(num(n.fat_100g)) },
    servingG: sq > 0 && sq < 2000 ? sq : null,
    servingLabel: p.serving_size || "",
    img: p.image_front_small_url || p.image_small_url || "",
    nutriscore: /^[a-e]$/.test(p.nutriscore_grade || "") ? p.nutriscore_grade : "",
    quantity: p.quantity || "",
    hasNutrition: kcal > 0,
    source: "off",
  };
}
const round1 = x => Math.round(x * 10) / 10;

export async function lookupBarcode(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Open Food Facts ne répond pas (" + r.status + ")");
  const j = await r.json();
  if (j.status === 0 || !j.product) return null;
  return fromOFF({ code, ...j.product });
}

export async function searchOFF(q, signal) {
  // 1) moteur de recherche moderne d'Open Food Facts
  try {
    const u = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=25&langs=fr&fields=${FIELDS}`;
    const r = await fetch(u, { signal });
    if (r.ok) {
      const j = await r.json();
      const list = (j.hits || []).map(fromOFF).filter(x => x && x.hasNutrition);
      if (list.length) return list;
    }
  } catch (e) { if (e.name === "AbortError") throw e; }
  // 2) ancienne API de recherche, en secours
  const u2 = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`;
  const r2 = await fetch(u2, { signal });
  if (!r2.ok) throw new Error("Recherche indisponible");
  const j2 = await r2.json();
  return (j2.products || []).map(fromOFF).filter(x => x && x.hasNutrition);
}
