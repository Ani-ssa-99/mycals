import { BASE_FOODS } from "./foods.js";
import { analyzeMeal, prepareImage, testKey } from "./ai.js";
import { lookupBarcode, searchOFF } from "./off.js";
import { RECIPES, SESSIONS, MOVES, PLANS } from "./tips.js";

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const r0 = x => Math.round(x || 0);
const r1 = x => Math.round((x || 0) * 10) / 10;
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtNum = n => r0(n).toLocaleString("fr-FR");
const fmt1 = n => r1(n).toLocaleString("fr-FR");
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");

const ICON = {
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  barcode: '<svg viewBox="0 0 24 24"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  torch: '<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 6H9zM9 9h6v12H9zM12 13v3"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 12v8h14v-8"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 5 5 3-3 5 5"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0l-2 3"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
};

const MEALS = [
  { id: "breakfast", name: "Petit-déjeuner", emoji: "🥐" },
  { id: "lunch", name: "Déjeuner", emoji: "🍽️" },
  { id: "snack", name: "Collations", emoji: "🍎" },
  { id: "dinner", name: "Dîner", emoji: "🌙" },
];
const mealName = id => MEALS.find(m => m.id === id)?.name || id;
function defaultMeal() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10.5) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

/* ---------- stockage ---------- */
const STORE_KEY = "mycals.v1";
const blank = () => ({ version: 1, profile: null, settings: { geminiKey: "", models: [], targetOverride: null, hideInstall: false }, days: {}, weights: [], recent: [], custom: [] });
let S = load();
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); } catch {}
  return blank();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch { toast("Stockage plein : supprime des photos ou exporte tes données"); }
}
const day = k => (S.days[k] ||= { entries: [], water: 0 });

/* ---------- calculs nutritionnels ---------- */
const ACTIVITY = [
  { v: 1.2, label: "Sédentaire", sub: "peu de sport" },
  { v: 1.375, label: "Un peu actif", sub: "1-3 séances/sem." },
  { v: 1.55, label: "Actif", sub: "3-5 séances/sem." },
  { v: 1.725, label: "Très actif", sub: "6-7 séances/sem." },
];
function currentWeight() {
  const w = [...S.weights].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return w ? w.kg : S.profile?.weightKg;
}
function targets() {
  const p = S.profile; if (!p) return null;
  const w = currentWeight();
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === "m" ? 5 : -161);
  const tdee = bmr * p.activity;
  const losing = p.goalWeightKg < w - 0.2;
  const deficit = losing ? (p.pace * 7700) / 7 : 0;
  const floor = p.sex === "m" ? 1500 : 1200;
  let kcal = Math.max(tdee - deficit, floor);
  const capped = tdee - deficit < floor;
  if (S.settings.targetOverride) kcal = S.settings.targetOverride;
  kcal = Math.round(kcal / 10) * 10;
  const refW = Math.min(w, Math.max(p.goalWeightKg, w * 0.85));
  const prot = Math.round(1.6 * refW);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { bmr: r0(bmr), tdee: r0(tdee), kcal, prot, fat, carbs, capped, deficit: r0(tdee - kcal), losing };
}
function totals(entries) {
  return entries.reduce((t, e) => ({ kcal: t.kcal + (e.kcal || 0), p: t.p + (e.p || 0), c: t.c + (e.c || 0), f: t.f + (e.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
}
const scaleFood = (food, grams) => ({
  kcal: (food.per100.kcal * grams) / 100, p: (food.per100.p * grams) / 100, c: (food.per100.c * grams) / 100, f: (food.per100.f * grams) / 100,
});

/* ---------- UI de base ---------- */
let tab = "today";
let curDate = todayKey();
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
const sheetStack = [];
function openSheet(html, mount) {
  const root = $("#sheet-root");
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); const i = sheetStack.indexOf(close); if (i >= 0) sheetStack.splice(i, 1); };
  sheetStack.push(close);
  $(".backdrop", wrap).onclick = close;
  const sheet = $(".sheet", wrap);
  $$("[data-close]", sheet).forEach(b => (b.onclick = close));
  mount?.(sheet, close);
  return close;
}
const closeAllSheets = () => [...sheetStack].forEach(c => c());
document.addEventListener("keydown", e => { if (e.key === "Escape") sheetStack[sheetStack.length - 1]?.(); });

function setTab(t) {
  tab = t;
  $$(".tabbar [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  render();
  window.scrollTo(0, 0);
}
$$(".tabbar [data-tab]").forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
$("#fab").onclick = () => openAddMenu();

function render() {
  const app = $("#app");
  $("#tabbar").classList.toggle("hidden", !S.profile);
  if (!S.profile) return renderOnboarding(app);
  if (tab === "today") renderToday(app);
  else if (tab === "progress") renderProgress(app);
  else if (tab === "foods") renderFoods(app);
  else if (tab === "tips") renderTips(app);
  else renderProfile(app);
}


/* ---------- Listes déroulantes (roue de choix native sur iPhone) ---------- */
function ruler({ name, label, unit, min, max, step, value }) {
  const dec = step < 1;
  const v = Number(value);
  const ip = Math.floor(v + 1e-9), fp = Math.round((v - ip) * 10);
  let opts = "";
  for (let i = min; i <= max; i++) opts += `<option value="${i}" ${i === ip ? "selected" : ""}>${i}</option>`;
  const decSel = dec ? `<span class="pk-sep">,</span><select class="pk-sel pk-dec" aria-label="${label} (décimale)">${Array.from({ length: 10 }, (_, d) => `<option value="${d}" ${d === fp ? "selected" : ""}>${d}</option>`).join("")}</select>` : "";
  return `<div class="picker" data-dec="${dec ? 1 : 0}">
    <span class="pk-label">${label}</span>
    <span class="pk-ctrl"><select class="pk-sel pk-int" aria-label="${label}">${opts}</select>${decSel}<span class="pk-unit">${unit}</span></span>
    <input type="hidden" name="${name}" value="${v}">
  </div>`;
}
function bindRulers(root) {
  root.querySelectorAll(".picker").forEach(p => {
    const int = p.querySelector(".pk-int"), dec = p.querySelector(".pk-dec"), input = p.querySelector("input");
    const sync = () => { input.value = dec ? +(+int.value + +dec.value / 10).toFixed(1) : +int.value; };
    int.onchange = sync; if (dec) dec.onchange = sync;
    sync();
  });
}

/* ---------- Onboarding / profil ---------- */
function profileForm(p = {}) {
  const sex = p.sex || "f";
  const act = p.activity || 1.375;
  const pace = p.pace || 0.5;
  return `
  <div class="stack">
    <div><label class="field"><span>Sexe</span></label>
      <div class="seg" data-seg="sex"><button type="button" data-v="f" class="${sex === "f" ? "on" : ""}">Femme</button><button type="button" data-v="m" class="${sex === "m" ? "on" : ""}">Homme</button></div></div>
    ${ruler({ name: "age", label: "Âge", unit: "ans", min: 12, max: 100, step: 1, value: p.age || 25 })}
    ${ruler({ name: "heightCm", label: "Taille", unit: "cm", min: 120, max: 220, step: 1, value: p.heightCm || 165 })}
    ${ruler({ name: "weightKg", label: "Poids actuel", unit: "kg", min: 30, max: 200, step: 0.1, value: p.weightKg || 70 })}
    <label class="field"><span>Niveau d'activité</span>
      <select class="input" name="activity">${ACTIVITY.map(a => `<option value="${a.v}" ${a.v === act ? "selected" : ""}>${a.label} (${a.sub})</option>`).join("")}</select></label>
    ${ruler({ name: "goalWeightKg", label: "Poids visé", unit: "kg", min: 30, max: 200, step: 0.1, value: p.goalWeightKg || 62 })}
    <div><label class="field"><span>Rythme de perte</span></label>
      <div class="seg" data-seg="pace">
        ${[[0.25, "Doux"], [0.5, "Conseillé"], [0.75, "Rapide"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === pace ? "on" : ""}">${l}<br><span class="small muted">${String(v).replace(".", ",")} kg/sem</span></button>`).join("")}
      </div></div>
  </div>`;
}
function bindProfileForm(root) {
  bindRulers(root);
  $$("[data-seg]", root).forEach(seg => $$("button", seg).forEach(b => (b.onclick = () => { $$("button", seg).forEach(x => x.classList.remove("on")); b.classList.add("on"); })));
}
function readProfileForm(root) {
  const v = n => parseFloat($(`[name=${n}]`, root).value.replace(",", "."));
  const p = {
    sex: $("[data-seg=sex] .on", root).dataset.v,
    age: v("age"), heightCm: v("heightCm"), weightKg: v("weightKg"),
    activity: v("activity"), goalWeightKg: v("goalWeightKg"),
    pace: parseFloat($("[data-seg=pace] .on", root).dataset.v),
  };
  if (!(p.age >= 12 && p.age <= 100)) return toast("Indique un âge valide"), null;
  if (!(p.heightCm >= 120 && p.heightCm <= 230)) return toast("Indique ta taille en cm"), null;
  if (!(p.weightKg >= 30 && p.weightKg <= 300)) return toast("Indique ton poids en kg"), null;
  if (!(p.goalWeightKg >= 30 && p.goalWeightKg <= 300)) return toast("Indique ton poids visé"), null;
  return p;
}

function renderOnboarding(app) {
  app.innerHTML = `
  <div class="onb">
    <img src="icons/icon-192.png" alt="" class="logo">
    <h1 class="hero-title">Bienvenue sur Mycals</h1>
    <p class="muted">Photographie ton assiette ou scanne un code-barres : les calories se calculent toutes seules. Commençons par ton objectif.</p>
    <form class="card" id="onb-form">${profileForm()}<div style="margin-top:16px"><button class="btn" type="submit">Calculer mon objectif</button></div></form>
    <p class="small muted">Tes données restent sur ton téléphone. Rien n'est envoyé à un serveur, sauf les photos que tu fais analyser.</p>
  </div>`;
  const f = $("#onb-form");
  bindProfileForm(f);
  f.onsubmit = e => {
    e.preventDefault();
    const p = readProfileForm(f); if (!p) return;
    S.profile = { ...p, startWeightKg: p.weightKg, startDate: todayKey() };
    S.weights = [{ date: todayKey(), kg: p.weightKg }];
    save();
    showTargetResult(true);
  };
}

function showTargetResult(first) {
  const t = targets();
  const p = S.profile;
  const weeks = t.losing ? Math.ceil((currentWeight() - p.goalWeightKg) / p.pace) : 0;
  const goalDate = new Date(); goalDate.setDate(goalDate.getDate() + weeks * 7);
  openSheet(`
    <h2>Ton objectif quotidien</h2>
    <div class="result-big">${fmtNum(t.kcal)} kcal</div>
    <p class="muted small">Ta dépense estimée est de ${fmtNum(t.tdee)} kcal par jour (métabolisme de base ${fmtNum(t.bmr)} kcal, formule Mifflin-St Jeor).
    ${t.losing ? `Avec un déficit de ${fmtNum(t.deficit)} kcal par jour, tu peux atteindre ${String(p.goalWeightKg).replace(".", ",")} kg vers le <b>${goalDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</b>.` : "Ton objectif est de maintenir ton poids."}</p>
    ${t.capped ? `<div class="tip">Pour rester en bonne santé, l'objectif ne descend pas sous ${p.sex === "m" ? "1 500" : "1 200"} kcal. La perte sera un peu plus lente que le rythme choisi.</div>` : ""}
    <div class="kv" style="margin:14px 0">
      <div><b>${t.prot} g</b><span>Protéines</span></div><div><b>${t.carbs} g</b><span>Glucides</span></div><div><b>${t.fat} g</b><span>Lipides</span></div><div><b>${fmtNum(t.kcal)}</b><span>kcal</span></div>
    </div>
    <button class="btn" data-close>${first ? "C'est parti !" : "OK"}</button>`, (s, close) => {
    $("[data-close]", s).onclick = () => { close(); tab = "today"; render(); if (first && !S.settings.geminiKey) setTimeout(() => toast("Astuce : active la reconnaissance photo dans Profil", 3500), 600); };
  });
  render();
}

/* ---------- Journal ---------- */
function ring(eaten, goal) {
  const R = 56, C = 2 * Math.PI * R;
  const pct = goal ? Math.min(eaten / goal, 1) : 0;
  const left = goal - eaten;
  return `<div class="ring ${left < 0 ? "over" : ""}"><svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="${R}" fill="none" stroke-width="12"/>
    <circle class="bar" cx="66" cy="66" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
    <div class="center"><div><div class="big">${fmtNum(Math.abs(left))}</div><div class="lbl">${left < 0 ? "kcal en trop" : "kcal restantes"}</div></div></div></div>`;
}
function dateLabel(k) {
  const t = todayKey();
  if (k === t) return "Aujourd'hui";
  if (k === addDays(t, -1)) return "Hier";
  if (k === addDays(t, 1)) return "Demain";
  return parseKey(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function entryThumb(e) {
  if (e.thumb) return `<img src="${e.thumb}" alt="">`;
  if (e.img) return `<img src="${esc(e.img)}" alt="" loading="lazy" onerror="this.remove()">`;
  if (e.emoji) return e.emoji;
  return { ia: "📸", off: "🏷️", quick: "⚡", base: "🥗", custom: "⭐", recette: "🥗" }[e.source] || "🍴";
}

function renderToday(app) {
  const t = targets();
  const d = day(curDate);
  const tot = totals(d.entries);
  const banner = installBanner();
  app.innerHTML = `
    <div class="header">
      <div><div class="muted small">${parseKey(curDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div><h1>${dateLabel(curDate)}</h1></div>
      <div class="date-nav"><button class="icon-btn" id="prev" aria-label="Jour précédent">${ICON.left}</button><button class="icon-btn" id="next" aria-label="Jour suivant">${ICON.right}</button></div>
    </div>
    ${banner}
    <div class="card">
      <div class="summary">${ring(tot.kcal, t.kcal)}
        <div class="sum-lines">
          <div class="sum-line"><span class="muted">Objectif</span><b>${fmtNum(t.kcal)}</b></div>
          <div class="sum-line"><span class="muted">Mangé</span><b>${fmtNum(tot.kcal)}</b></div>
          <div class="sum-line"><span class="muted">Restant</span><b style="color:${t.kcal - tot.kcal < 0 ? "var(--warn)" : "var(--accent)"}">${fmtNum(t.kcal - tot.kcal)}</b></div>
        </div>
      </div>
      <div class="macros">
        ${[["p", "Protéines", tot.p, t.prot], ["c", "Glucides", tot.c, t.carbs], ["f", "Lipides", tot.f, t.fat]].map(([k, n, v, g]) => `
          <div class="macro ${k}"><div class="name">${n}</div><div class="val">${r0(v)} <span class="muted">/ ${g} g</span></div><div class="pbar"><i style="width:${Math.min(100, (v / g) * 100)}%"></i></div></div>`).join("")}
      </div>
    </div>
    ${MEALS.map(m => mealCard(m, d)).join("")}
    <div class="card">
      <div class="meal-head"><h2>🏃‍♀️ Activité</h2><span class="meal-kcal">${(d.activities || []).length ? "−" + fmtNum((d.activities || []).reduce((a, x) => a + x.kcal, 0)) + " kcal" : ""}</span></div>
      ${(d.activities || []).map(a => `<div class="entry"><div class="thumb">${a.emoji || "🏃‍♀️"}</div><div class="grow"><div class="name">${esc(a.name)}</div><div class="meta">${a.min} min</div></div><div class="kcal">−${fmtNum(a.kcal)}</div><button class="btn sm ghost" data-del-act="${a.id}" aria-label="Supprimer">✕</button></div>`).join("")}
      <button class="add-line" id="go-tips">${(d.activities || []).length ? "+ Ajouter une séance" : "Voir les séances conseillées"}</button>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">💧 Eau</h2><span class="muted small">${d.water || 0} / 8 verres</span></div>
      <div class="chips" style="margin-top:10px" id="water">${Array.from({ length: 8 }, (_, i) => `<button class="chip ${i < (d.water || 0) ? "on" : ""}" data-i="${i}">💧</button>`).join("")}</div>
    </div>`;
  $("#prev").onclick = () => { curDate = addDays(curDate, -1); render(); };
  $("#next").onclick = () => { curDate = addDays(curDate, 1); render(); };
  $$("#water .chip").forEach(b => (b.onclick = () => { const i = +b.dataset.i; d.water = d.water === i + 1 ? i : i + 1; save(); render(); }));
  $$("[data-add-meal]").forEach(b => (b.onclick = () => openAddMenu(b.dataset.addMeal)));
  $$("[data-entry]").forEach(b => (b.onclick = () => openEntry(b.dataset.entry)));
  $$("[data-copy-meal]").forEach(b => (b.onclick = () => copyYesterday(b.dataset.copyMeal)));
  $("#go-tips").onclick = () => { tipsView = "sport"; setTab("tips"); };
  $$("[data-del-act]").forEach(b => (b.onclick = () => { d.activities = d.activities.filter(a => a.id !== b.dataset.delAct); save(); render(); }));
  bindInstallBanner();
}
function mealCard(m, d) {
  const items = d.entries.filter(e => e.meal === m.id);
  const kcal = totals(items).kcal;
  const yest = S.days[addDays(curDate, -1)]?.entries.filter(e => e.meal === m.id) || [];
  return `<div class="card">
    <div class="meal-head"><h2>${m.emoji} ${m.name}</h2><span class="meal-kcal">${kcal ? fmtNum(kcal) + " kcal" : ""}</span></div>
    ${items.map(e => `<button class="entry" data-entry="${e.id}"><div class="thumb">${entryThumb(e)}</div>
      <div class="grow"><div class="name">${esc(e.name)}</div><div class="meta">${e.grams ? r0(e.grams) + " g · " : ""}P ${r0(e.p)} · G ${r0(e.c)} · L ${r0(e.f)}</div></div>
      <div class="kcal">${fmtNum(e.kcal)}</div></button>`).join("")}
    <div class="row" style="gap:8px">
      <button class="add-line" data-add-meal="${m.id}">+ Ajouter</button>
      ${!items.length && yest.length ? `<button class="add-line" style="width:auto;padding:9px 12px" data-copy-meal="${m.id}" title="Copier d'hier">${"Comme hier"}</button>` : ""}
    </div>
  </div>`;
}
function copyYesterday(meal) {
  const src = S.days[addDays(curDate, -1)]?.entries.filter(e => e.meal === meal) || [];
  src.forEach(e => day(curDate).entries.push({ ...e, id: uid(), time: Date.now() }));
  save(); render(); toast(`${src.length} aliment(s) copiés d'hier`);
}

function addEntry(entry) {
  const e = { id: uid(), time: Date.now(), ...entry };
  e.kcal = r0(e.kcal); e.p = r1(e.p); e.c = r1(e.c); e.f = r1(e.f);
  day(curDate).entries.push(e);
  save();
  return e;
}
function rememberFood(food) {
  if (!food || food.source === "quick") return;
  const k = food.id;
  S.recent = [food, ...S.recent.filter(f => f.id !== k)].slice(0, 40);
  save();
}

/* ---------- Menu d'ajout ---------- */
function openAddMenu(meal) {
  meal ||= curDate === todayKey() ? defaultMeal() : "lunch";
  openSheet(`
    <h2>Ajouter à ${esc(mealName(meal))}</h2>
    <div class="chips" id="meal-pick" style="margin-bottom:14px">${MEALS.map(m => `<button class="chip ${m.id === meal ? "on" : ""}" data-m="${m.id}">${m.name}</button>`).join("")}</div>
    <div class="add-grid">
      <button class="add-tile" data-act="photo"><div class="ic">${ICON.camera}</div><b>Photo du repas</b><span>L'IA reconnaît les aliments</span></button>
      <button class="add-tile" data-act="scan"><div class="ic">${ICON.barcode}</div><b>Code-barres</b><span>Scanne un produit</span></button>
      <button class="add-tile" data-act="search"><div class="ic">${ICON.search}</div><b>Rechercher</b><span>Aliments et marques</span></button>
      <button class="add-tile" data-act="text"><div class="ic">${ICON.chat}</div><b>Décrire</b><span>« 2 œufs et une tartine »</span></button>
      <button class="add-tile" data-act="gallery"><div class="ic">${ICON.image}</div><b>Depuis la galerie</b><span>Photo déjà prise</span></button>
      <button class="add-tile" data-act="quick"><div class="ic">${ICON.bolt}</div><b>Ajout rapide</b><span>Juste les calories</span></button>
    </div>`, (s, close) => {
    $$("#meal-pick .chip", s).forEach(b => (b.onclick = () => { meal = b.dataset.m; $$("#meal-pick .chip", s).forEach(x => x.classList.toggle("on", x === b)); $("h2", s).textContent = "Ajouter à " + mealName(meal); }));
    $$("[data-act]", s).forEach(b => (b.onclick = () => {
      const a = b.dataset.act; close();
      if (a === "photo") startPhoto(meal, false);
      else if (a === "gallery") startPhoto(meal, true);
      else if (a === "scan") openScanner(meal);
      else if (a === "search") openSearch(meal);
      else if (a === "text") openDescribe(meal);
      else openQuickAdd(meal);
    }));
  });
}

/* ---------- Fiche aliment (portion) ---------- */
function openFood(food, meal, opts = {}) {
  let grams = opts.grams || food.servingG || 100;
  const portions = [];
  if (food.servingG) portions.push([food.servingG, food.servingLabel ? `${food.servingLabel}` : "1 portion"]);
  portions.push([100, "100 g"]);
  if (!food.servingG || food.servingG !== 50) portions.push([50, "50 g"]);
  if (food.servingG) portions.push([food.servingG * 2, "x2"]);
  openSheet(`
    <div class="row" style="align-items:flex-start;margin-bottom:12px">
      ${food.img ? `<img src="${esc(food.img)}" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover;background:var(--bg)">` : `<div class="ph" style="width:64px;height:64px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;font-size:30px">🍴</div>`}
      <div class="grow"><h2 style="margin:0 0 4px">${esc(food.name)}</h2>
        <div class="muted small">${esc([food.brand, food.quantity].filter(Boolean).join(" · "))}</div>
        <div class="small" style="margin-top:4px">${food.nutriscore ? `<span class="nutri ${food.nutriscore}">${food.nutriscore}</span> Nutri-Score · ` : ""}<span class="muted">${fmtNum(food.per100.kcal)} kcal / 100 g</span></div>
      </div>
    </div>
    <div class="kv" id="food-kv"></div>
    <div style="margin:14px 0 8px"><label class="field"><span>Quantité (grammes ou ml)</span></label>
      <div class="row"><input class="input" id="grams" type="number" inputmode="decimal" min="1" step="1" value="${r0(grams)}" style="max-width:130px"><div class="chips">${portions.map(([g, l]) => `<button class="chip" data-g="${g}">${esc(l)}</button>`).join("")}</div></div></div>
    <label class="field" style="margin:12px 0 16px"><span>Repas</span><select class="input" id="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>
    <button class="btn" id="add">${opts.editId ? "Enregistrer" : "Ajouter au journal"}</button>
    ${food.source === "off" && !food.per100.kcal ? `<p class="tip" style="margin-top:12px">Ce produit n'a pas encore de valeurs nutritionnelles sur Open Food Facts. Utilise l'ajout rapide.</p>` : ""}`, (s, close) => {
    const upd = () => {
      grams = parseFloat($("#grams", s).value.replace(",", ".")) || 0;
      const v = scaleFood(food, grams);
      $("#food-kv", s).innerHTML = `<div><b>${fmtNum(v.kcal)}</b><span>kcal</span></div><div><b>${fmt1(v.p)}</b><span>Prot. (g)</span></div><div><b>${fmt1(v.c)}</b><span>Gluc. (g)</span></div><div><b>${fmt1(v.f)}</b><span>Lip. (g)</span></div>`;
    };
    upd();
    $("#grams", s).oninput = upd;
    $$("[data-g]", s).forEach(b => (b.onclick = () => { $("#grams", s).value = r0(+b.dataset.g); upd(); }));
    $("#add", s).onclick = () => {
      if (!grams) return toast("Indique une quantité");
      const v = scaleFood(food, grams);
      const m = $("#meal", s).value;
      const base = { meal: m, name: food.name, brand: food.brand || "", grams, ...v, source: food.source, img: food.img || "", food: { id: food.id, barcode: food.barcode, name: food.name, brand: food.brand, per100: food.per100, servingG: food.servingG, servingLabel: food.servingLabel, img: food.img, source: food.source, nutriscore: food.nutriscore } };
      if (opts.editId) {
        const d = day(curDate); const i = d.entries.findIndex(e => e.id === opts.editId);
        if (i >= 0) d.entries[i] = { ...d.entries[i], ...base, kcal: r0(v.kcal), p: r1(v.p), c: r1(v.c), f: r1(v.f) };
        save();
      } else { addEntry(base); rememberFood(base.food); }
      close(); closeAllSheets(); tab = "today"; setTab("today");
      toast(`${opts.editId ? "Modifié" : "Ajouté"} : ${fmtNum(v.kcal)} kcal`);
    };
  });
}

/* ---------- Modifier une entrée ---------- */
function openEntry(id) {
  const d = day(curDate);
  const e = d.entries.find(x => x.id === id); if (!e) return;
  if (e.food?.per100 && e.grams) return openFood(e.food, e.meal, { grams: e.grams, editId: e.id, entry: e });
  openSheet(`
    <h2>${esc(e.name)}</h2>
    <div class="stack">
      <label class="field"><span>Nom</span><input class="input" id="n" value="${esc(e.name)}"></label>
      <div class="grid2"><label class="field"><span>Calories (kcal)</span><input class="input" id="k" type="number" inputmode="decimal" value="${r0(e.kcal)}"></label>
      <label class="field"><span>Repas</span><select class="input" id="m">${MEALS.map(m => `<option value="${m.id}" ${m.id === e.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select></label></div>
      <div class="grid3"><label class="field"><span>Protéines (g)</span><input class="input" id="p" type="number" inputmode="decimal" value="${r1(e.p)}"></label>
      <label class="field"><span>Glucides (g)</span><input class="input" id="c" type="number" inputmode="decimal" value="${r1(e.c)}"></label>
      <label class="field"><span>Lipides (g)</span><input class="input" id="f" type="number" inputmode="decimal" value="${r1(e.f)}"></label></div>
      <button class="btn" id="save">Enregistrer</button>
    </div>`, (s, close) => {
    $("#save", s).onclick = () => {
      const n = id => parseFloat($(id, s).value.replace(",", ".")) || 0;
      Object.assign(e, { name: $("#n", s).value.trim() || e.name, kcal: n("#k"), p: n("#p"), c: n("#c"), f: n("#f"), meal: $("#m", s).value });
      save(); close(); render(); toast("Modifié");
    };
  });
  addDeleteButton(e);
}
function addDeleteButton(e) {
  const s = $$(".sheet").pop(); if (!s) return;
  const b = document.createElement("button");
  b.className = "btn danger"; b.style.marginTop = "10px"; b.textContent = "Supprimer du journal";
  b.onclick = () => {
    const d = day(curDate); d.entries = d.entries.filter(x => x.id !== e.id); save();
    closeAllSheets(); render(); toast("Supprimé");
  };
  s.appendChild(b);
}

/* ---------- Ajout rapide ---------- */
function openQuickAdd(meal, prefill = {}) {
  openSheet(`
    <h2>Ajout rapide</h2>
    <div class="stack">
      <label class="field"><span>Nom</span><input class="input" id="n" placeholder="Ex. : Repas au restaurant" value="${esc(prefill.name || "")}"></label>
      <label class="field"><span>Calories (kcal)</span><input class="input" id="k" type="number" inputmode="numeric" placeholder="450" value="${prefill.kcal || ""}"></label>
      <div class="grid3"><label class="field"><span>Protéines (g)</span><input class="input" id="p" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Glucides (g)</span><input class="input" id="c" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Lipides (g)</span><input class="input" id="f" type="number" inputmode="decimal" placeholder="0"></label></div>
      <label class="row small"><input type="checkbox" id="fav" style="width:20px;height:20px;accent-color:var(--accent)"> Enregistrer dans « Mes aliments »</label>
      <button class="btn" id="add">Ajouter</button>
    </div>`, (s, close) => {
    setTimeout(() => $("#k", s).focus(), 250);
    $("#add", s).onclick = () => {
      const n = id => parseFloat($(id, s).value.replace(",", ".")) || 0;
      const kcal = n("#k"); if (!kcal) return toast("Indique les calories");
      const name = $("#n", s).value.trim() || "Ajout rapide";
      const e = { meal, name, kcal, p: n("#p"), c: n("#c"), f: n("#f"), source: "quick" };
      if (prefill.barcode) e.barcode = prefill.barcode;
      addEntry(e);
      if ($("#fav", s).checked) {
        S.custom.unshift({ id: "custom-" + uid(), name, brand: "", per100: { kcal, p: n("#p"), c: n("#c"), f: n("#f") }, servingG: 100, servingLabel: "1 portion", source: "custom", unit: "portion" });
        save();
      }
      close(); setTab("today"); toast(`Ajouté : ${fmtNum(kcal)} kcal`);
    };
  });
}

/* ---------- Recherche ---------- */
function localSearch(q) {
  const nq = norm(q).trim(); if (!nq) return [];
  const words = nq.split(/\s+/);
  const pool = [...S.custom, ...S.recent, ...BASE_FOODS];
  const seen = new Set();
  return pool.filter(f => {
    if (seen.has(f.id)) return false;
    const h = norm(f.name + " " + (f.brand || ""));
    const ok = words.every(w => h.includes(w));
    if (ok) seen.add(f.id);
    return ok;
  }).sort((a, b) => norm(a.name).indexOf(words[0]) - norm(b.name).indexOf(words[0])).slice(0, 30);
}
function foodRow(f) {
  const thumb = f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy">` : `<div class="ph">${{ base: "🥗", custom: "⭐", off: "🏷️" }[f.source] || "🍴"}</div>`;
  const sub = [f.brand, f.servingLabel && f.servingG ? `${f.servingLabel} (${r0(f.servingG)} g)` : ""].filter(Boolean).join(" · ");
  return `<button class="food-row" data-food="${esc(f.id)}">${thumb}<div class="grow"><div style="font-weight:600">${esc(f.name)}</div><div class="small muted">${esc(sub)}</div></div>
    <div style="text-align:right"><b>${fmtNum(f.per100.kcal)}</b><div class="small muted">kcal/100 g</div></div></button>`;
}
function openSearch(meal, initial = "") {
  let ctrl;
  let offResults = [];
  openSheet(`
    <h2>Rechercher un aliment</h2>
    <form id="sf" class="row"><input class="input" id="q" type="search" placeholder="Ex. : skyr, baguette, Prince…" value="${esc(initial)}" autocomplete="off" enterkeyhint="search"></form>
    <div id="res" style="margin-top:10px"></div>`, (s, close) => {
    const res = $("#res", s); const qi = $("#q", s);
    const byId = new Map();
    const show = () => {
      const q = qi.value;
      const loc = q ? localSearch(q) : [...S.custom, ...S.recent].slice(0, 25);
      [...loc, ...offResults].forEach(f => byId.set(f.id, f));
      res.innerHTML = `
        ${!q && loc.length ? `<div class="small muted" style="margin:6px 0">Récents et favoris</div>` : ""}
        ${!q && !loc.length ? `<p class="muted small">Tape le nom d'un aliment ou d'une marque. Les résultats de la base Open Food Facts (des millions de produits) apparaissent quand tu valides.</p>` : ""}
        ${loc.map(foodRow).join("")}
        ${q ? `<div id="off-zone">${offResults.length ? `<div class="small muted" style="margin:14px 0 6px">Produits Open Food Facts</div>${offResults.map(foodRow).join("")}` : `<button class="btn secondary" id="off-btn" style="margin-top:12px">Chercher « ${esc(q)} » dans les produits du commerce</button>`}</div>` : ""}
        ${q ? `<button class="btn ghost" id="quick" style="margin-top:10px">Ajouter « ${esc(q)} » manuellement</button>` : ""}`;
      $$("[data-food]", res).forEach(b => (b.onclick = () => openFood(byId.get(b.dataset.food), meal)));
      const ob = $("#off-btn", res); if (ob) ob.onclick = runOFF;
      const qb = $("#quick", res); if (qb) qb.onclick = () => { close(); openQuickAdd(meal, { name: qi.value }); };
    };
    const runOFF = async () => {
      const q = qi.value.trim(); if (!q) return;
      ctrl?.abort(); ctrl = new AbortController();
      const z = $("#off-zone", res); if (z) z.innerHTML = `<div class="loading"><div class="spinner"></div><span class="muted small">Recherche dans Open Food Facts…</span></div>`;
      try {
        offResults = await searchOFF(q, ctrl.signal);
        if (!offResults.length) { const z2 = $("#off-zone", res); if (z2) z2.innerHTML = `<p class="muted small" style="margin-top:12px">Aucun produit trouvé.</p>`; return; }
        show();
      } catch (e) {
        if (e.name === "AbortError") return;
        const z2 = $("#off-zone", res); if (z2) z2.innerHTML = `<p class="muted small" style="margin-top:12px">Recherche indisponible pour le moment (connexion ?).</p>`;
      }
    };
    qi.oninput = () => { offResults = []; show(); };
    $("#sf", s).onsubmit = e => { e.preventDefault(); qi.blur(); runOFF(); };
    show();
    if (!initial) setTimeout(() => qi.focus(), 250); else runOFF();
  });
}

/* ---------- Scanner de codes-barres ---------- */
let detectorPromise;
async function getDetector() {
  const formats = ["ean_13", "ean_8", "upc_a", "upc_e"];
  if ("BarcodeDetector" in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (formats.some(f => sup.includes(f))) return new window.BarcodeDetector({ formats: formats.filter(f => sup.includes(f)) });
    } catch {}
  }
  detectorPromise ||= import("./vendor/barcode.js").then(m => new m.BarcodeDetector({ formats }));
  return detectorPromise;
}
async function openScanner(meal) {
  const el = document.createElement("div");
  el.className = "scanner";
  el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"><div class="laser"></div></div>
    <div class="top row between"><button class="icon-btn" id="x" aria-label="Fermer">${ICON.close}</button><button class="icon-btn" id="torch" aria-label="Lampe" hidden>${ICON.torch}</button></div>
    <div class="bottom"><div class="hint" id="hint">Place le code-barres dans le cadre</div>
      <form id="manual" class="row"><input class="input" id="code" inputmode="numeric" pattern="[0-9]*" placeholder="ou tape les chiffres du code" style="background:rgba(255,255,255,.95);color:#111"><button class="btn sm" type="submit">OK</button></form></div>`;
  document.body.appendChild(el);
  const video = $("video", el);
  let stream, running = true, torchOn = false;
  const stop = () => { running = false; stream?.getTracks().forEach(t => t.stop()); el.remove(); };
  $("#x", el).onclick = stop;
  const found = async code => {
    if (!running) return; stop();
    navigator.vibrate?.(60);
    await handleBarcode(code, meal);
  };
  $("#manual", el).onsubmit = e => { e.preventDefault(); const c = $("#code", el).value.replace(/\D/g, ""); if (c.length >= 6) found(c); else toast("Code trop court"); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (!running) return stream.getTracks().forEach(t => t.stop());
    video.srcObject = stream; await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (caps.torch) { const tb = $("#torch", el); tb.hidden = false; tb.onclick = () => { torchOn = !torchOn; track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {}); }; }
    if (caps.focusMode?.includes?.("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  } catch (e) {
    $("#hint", el).textContent = "Caméra indisponible. Autorise l'accès à la caméra ou tape le code ci-dessous.";
    return;
  }
  let detector;
  try { detector = await getDetector(); } catch { $("#hint", el).textContent = "Lecteur indisponible. Tape le code ci-dessous."; return; }
  let last = "", hits = 0;
  const loop = async () => {
    if (!running) return;
    if (video.readyState >= 2) {
      try {
        const codes = await detector.detect(video);
        const c = codes.find(x => /^\d{8,14}$/.test(x.rawValue))?.rawValue;
        if (c) { hits = c === last ? hits + 1 : 1; last = c; if (hits >= 2 || "BarcodeDetector" in window) return found(c); }
      } catch {}
    }
    setTimeout(loop, 120);
  };
  loop();
}
async function handleBarcode(code, meal) {
  const closeLoading = openSheet(`<div class="loading"><div class="spinner"></div><div>Recherche du produit <b>${esc(code)}</b>…</div></div>`);
  const known = [...S.recent, ...S.custom].find(f => f.barcode === code);
  try {
    const food = known || (await lookupBarcode(code));
    closeLoading();
    if (!food) {
      openSheet(`<h2>Produit inconnu</h2><p class="muted">Le code ${esc(code)} n'est pas encore dans Open Food Facts. Tu peux l'ajouter à la main (et même l'ajouter sur openfoodfacts.org pour aider tout le monde).</p>
        <div class="btns"><button class="btn" id="q">Ajout manuel</button><button class="btn ghost" id="r">Scanner à nouveau</button></div>`, (s, close) => {
        $("#q", s).onclick = () => { close(); openQuickAdd(meal, { barcode: code }); };
        $("#r", s).onclick = () => { close(); openScanner(meal); };
      });
      return;
    }
    openFood(food, meal);
  } catch (e) {
    closeLoading();
    toast("Impossible de joindre Open Food Facts. Vérifie ta connexion.", 3500);
  }
}

/* ---------- IA : photo et description ---------- */
function needKey(after) {
  if (S.settings.geminiKey) return false;
  openKeySetup(after);
  return true;
}
function startPhoto(meal, gallery) {
  if (needKey(() => startPhoto(meal, gallery))) return;
  const input = $(gallery ? "#photo-input-gallery" : "#photo-input");
  input.value = "";
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    let img;
    try { img = await prepareImage(file); } catch { return toast("Image illisible"); }
    runAnalysis(meal, { img });
  };
  input.click();
}
function openDescribe(meal) {
  if (needKey(() => openDescribe(meal))) return;
  openSheet(`<h2>Décris ton repas</h2>
    <textarea class="input" id="t" rows="4" placeholder="Ex. : une assiette de pâtes bolognaise, un verre de vin rouge et un carré de chocolat"></textarea>
    <p class="small muted">Plus tu es précis (quantités, marque, cuisson), plus l'estimation est juste.</p>
    <button class="btn" id="go">Estimer les calories</button>`, (s, close) => {
    setTimeout(() => $("#t", s).focus(), 250);
    $("#go", s).onclick = () => { const t = $("#t", s).value.trim(); if (t.length < 3) return toast("Décris ce que tu as mangé"); close(); runAnalysis(meal, { text: t }); };
  });
}
async function runAnalysis(meal, { img, text, hint }) {
  const closeLoading = openSheet(`${img ? `<img class="ai-photo" src="${img.dataUrl}" alt="">` : ""}<div class="loading"><div class="spinner"></div><div>Analyse en cours…</div><div class="small muted">L'IA identifie les aliments et estime les portions</div></div>`);
  try {
    const out = await analyzeMeal({ key: S.settings.geminiKey, models: S.settings.models, imageB64: img?.b64, text: [text, hint].filter(Boolean).join(". ") });
    closeLoading();
    showAIResult(meal, out, img, text);
  } catch (e) {
    closeLoading();
    openSheet(`<h2>Oups</h2><p>${esc(e.message)}</p><div class="btns"><button class="btn" id="retry">Réessayer</button><button class="btn ghost" id="manual">Saisir à la main</button></div>`, (s, close) => {
      $("#retry", s).onclick = () => { close(); runAnalysis(meal, { img, text, hint }); };
      $("#manual", s).onclick = () => { close(); openSearch(meal); };
    });
  }
}
function showAIResult(meal, out, img, text) {
  const items = (out.aliments || []).map(a => ({
    on: true, name: a.nom, g0: Math.max(1, +a.grammes || 100), grams: Math.max(1, +a.grammes || 100),
    kcal: +a.kcal || 0, p: +a.proteines || 0, c: +a.glucides || 0, f: +a.lipides || 0, conf: a.confiance,
  }));
  if (!items.length) {
    openSheet(`<h2>Aucun aliment reconnu</h2><p class="muted">Essaie avec une photo plus nette, prise du dessus et bien éclairée, ou décris ton repas.</p>
      <div class="btns"><button class="btn" id="d">Décrire mon repas</button><button class="btn ghost" data-close>Fermer</button></div>`, (s, close) => { $("#d", s).onclick = () => { close(); openDescribe(meal); }; });
    return;
  }
  openSheet(`
    ${img ? `<img class="ai-photo" src="${img.dataUrl}" alt="">` : ""}
    <h2>${esc(out.plat || "Ton repas")}</h2>
    <p class="small muted" style="margin-top:-6px">Vérifie les quantités : tu peux ajuster les grammes, décocher un aliment ou préciser à l'IA.</p>
    <div id="items"></div>
    <div class="kv" id="tot" style="margin:6px 0 12px"></div>
    ${out.remarque ? `<div class="tip" style="margin-bottom:12px">💡 ${esc(out.remarque)}</div>` : ""}
    <div class="row" style="margin-bottom:12px"><input class="input" id="hint" placeholder="Corriger : « c'était du riz complet, 2 cuillères d'huile »"><button class="btn sm secondary" id="redo">Relancer</button></div>
    <label class="field" style="margin-bottom:14px"><span>Repas</span><select class="input" id="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>
    <div class="btns two"><button class="btn ghost" id="sep">Ajouter séparément</button><button class="btn" id="one">Ajouter le repas</button></div>`, (s, close) => {
    const cur = it => { const k = it.grams / it.g0; return { kcal: it.kcal * k, p: it.p * k, c: it.c * k, f: it.f * k }; };
    const draw = () => {
      $("#items", s).innerHTML = items.map((it, i) => { const v = cur(it); return `
        <div class="ai-item ${it.on ? "" : "off"}" data-i="${i}">
          <div class="top"><input type="checkbox" ${it.on ? "checked" : ""} data-on="${i}">
            <div class="grow"><div style="font-weight:650">${esc(it.name)} ${it.conf === "faible" ? `<span class="badge warn">à vérifier</span>` : ""}</div>
              <div class="small muted">P ${r0(v.p)} · G ${r0(v.c)} · L ${r0(v.f)}</div></div><b>${fmtNum(v.kcal)} kcal</b></div>
          <div class="gram"><button class="btn sm ghost" data-step="-1" data-i="${i}">−</button><input class="input" type="number" inputmode="decimal" value="${r0(it.grams)}" data-g="${i}"><span class="muted small">g</span><button class="btn sm ghost" data-step="1" data-i="${i}">+</button></div>
        </div>`; }).join("");
      const t = items.filter(x => x.on).map(cur).reduce((a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f }), { kcal: 0, p: 0, c: 0, f: 0 });
      $("#tot", s).innerHTML = `<div><b>${fmtNum(t.kcal)}</b><span>kcal</span></div><div><b>${r0(t.p)}</b><span>Prot. (g)</span></div><div><b>${r0(t.c)}</b><span>Gluc. (g)</span></div><div><b>${r0(t.f)}</b><span>Lip. (g)</span></div>`;
      $$("[data-on]", s).forEach(c => (c.onchange = () => { items[+c.dataset.on].on = c.checked; draw(); }));
      $$("[data-g]", s).forEach(inp => (inp.onchange = () => { items[+inp.dataset.g].grams = Math.max(1, parseFloat(inp.value) || 1); draw(); }));
      $$("[data-step]", s).forEach(b => (b.onclick = () => { const it = items[+b.dataset.i]; const st = it.g0 >= 100 ? 10 : 5; it.grams = Math.max(st, r0(it.grams + st * +b.dataset.step)); draw(); }));
    };
    draw();
    $("#redo", s).onclick = () => { const h = $("#hint", s).value.trim(); if (!h) return toast("Écris ta correction"); close(); runAnalysis(meal, { img, text, hint: h }); };
    const commit = separate => {
      const sel = items.filter(x => x.on); if (!sel.length) return toast("Sélectionne au moins un aliment");
      const m = $("#meal", s).value;
      if (separate) sel.forEach((it, i) => addEntry({ meal: m, name: it.name, grams: it.grams, ...cur(it), source: "ia", thumb: i === 0 ? img?.thumb : undefined }));
      else {
        const t = sel.map(cur).reduce((a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f }), { kcal: 0, p: 0, c: 0, f: 0 });
        addEntry({ meal: m, name: out.plat || sel.map(x => x.name).join(", "), detail: sel.map(x => `${x.name} (${r0(x.grams)} g)`).join(", "), ...t, source: "ia", thumb: img?.thumb });
      }
      close(); setTab("today"); toast("Repas ajouté");
    };
    $("#one", s).onclick = () => commit(false);
    $("#sep", s).onclick = () => commit(true);
  });
}

function openKeySetup(after) {
  openSheet(`
    <h2>Activer la reconnaissance photo</h2>
    <p class="small muted" style="margin-top:-4px">Mycals utilise l'IA Gemini de Google, gratuite avec ta propre clé. Ça prend 1 minute, une seule fois.</p>
    <ol class="steps">
      <li>Ouvre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> et connecte-toi avec ton compte Google.</li>
      <li>Appuie sur <b>Create API key</b> (Créer une clé API), accepte les conditions si on te le demande.</li>
      <li>Copie la clé (elle commence par <b>AIza…</b>) et colle-la ci-dessous.</li>
    </ol>
    <label class="field"><span>Ta clé API Gemini</span><input class="input" id="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="AIza…" value="${esc(S.settings.geminiKey)}"></label>
    <p class="tip" style="margin:10px 0 14px">🔒 La clé reste uniquement sur ton téléphone. Ne la partage pas : chacun de tes amis crée la sienne gratuitement. Aucune carte bancaire n'est nécessaire.</p>
    <div class="btns"><button class="btn" id="save">Enregistrer et tester</button>${S.settings.geminiKey ? `<button class="btn danger" id="del">Supprimer la clé</button>` : ""}</div>`, (s, close) => {
    $("#save", s).onclick = async () => {
      const k = $("#key", s).value.trim();
      if (!k) return toast("Colle ta clé");
      const b = $("#save", s); b.disabled = true; b.textContent = "Vérification…";
      try {
        const models = await testKey(k);
        S.settings.geminiKey = k; S.settings.models = models.slice(0, 6); save();
        close(); toast("Reconnaissance photo activée ✅"); render(); after?.();
      } catch (e) {
        b.disabled = false; b.textContent = "Enregistrer et tester";
        toast(e.status === 400 || e.status === 403 ? "Clé refusée par Google. Vérifie le copier-coller." : (e.name === "TypeError" ? "Pas de connexion internet" : e.message), 4000);
      }
    };
    const d = $("#del", s); if (d) d.onclick = () => { S.settings.geminiKey = ""; S.settings.models = []; save(); close(); render(); toast("Clé supprimée"); };
  });
}

/* ---------- Progrès ---------- */
function lineChart(points, goal) {
  const W = 340, H = 170, P = { l: 30, r: 10, t: 12, b: 22 };
  if (points.length < 1) return "";
  const xs = points.map(p => parseKey(p.date).getTime());
  const ys = points.map(p => p.kg);
  const minX = Math.min(...xs), maxX = Math.max(...xs, minX + 86400000 * 6);
  let minY = Math.min(...ys, goal ?? Infinity) - 1, maxY = Math.max(...ys) + 1;
  const X = x => P.l + ((x - minX) / (maxX - minX)) * (W - P.l - P.r);
  const Y = y => P.t + (1 - (y - minY) / (maxY - minY)) * (H - P.t - P.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(p.kg).toFixed(1)}`).join("");
  const area = path + `L${X(xs[xs.length - 1]).toFixed(1)},${H - P.b}L${X(xs[0]).toFixed(1)},${H - P.b}Z`;
  const ticks = 4; let g = "";
  for (let i = 0; i <= ticks; i++) { const v = minY + ((maxY - minY) * i) / ticks; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 4}" y="${Y(v) + 3}" text-anchor="end">${r0(v)}</text>`; }
  const fmtD = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">${g}
    ${goal ? `<line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${Y(goal)}" y2="${Y(goal)}"/><text x="${W - P.r}" y="${Y(goal) - 4}" text-anchor="end" style="fill:var(--warn)">objectif ${String(goal).replace(".", ",")}</text>` : ""}
    <path class="area" d="${area}"/><path class="line" d="${path}"/>
    ${points.map((p, i) => `<circle class="dot" cx="${X(xs[i])}" cy="${Y(p.kg)}" r="3"/>`).join("")}
    <text x="${P.l}" y="${H - 6}">${fmtD(minX)}</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end">${fmtD(maxX)}</text></svg>`;
}
function barChart(days, goal) {
  const W = 340, H = 150, P = { l: 8, r: 8, t: 14, b: 22 };
  const max = Math.max(goal * 1.25, ...days.map(d => d.kcal));
  const bw = (W - P.l - P.r) / days.length;
  const Y = v => P.t + (1 - v / max) * (H - P.t - P.b);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories des 7 derniers jours">
    ${days.map((d, i) => { const h = H - P.b - Y(d.kcal); return `<rect class="barc ${d.kcal > goal ? "over" : ""}" x="${P.l + i * bw + bw * 0.18}" y="${Y(d.kcal)}" width="${bw * 0.64}" height="${Math.max(h, d.kcal ? 2 : 0)}" rx="5"/>
      <text x="${P.l + i * bw + bw / 2}" y="${H - 7}" text-anchor="middle">${d.label}</text>${d.kcal ? `<text x="${P.l + i * bw + bw / 2}" y="${Y(d.kcal) - 4}" text-anchor="middle">${r0(d.kcal)}</text>` : ""}`; }).join("")}
    <line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${Y(goal)}" y2="${Y(goal)}"/></svg>`;
}
function renderProgress(app) {
  const p = S.profile, t = targets();
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  const cw = currentWeight();
  const lost = r1(p.startWeightKg - cw);
  const left = r1(cw - p.goalWeightKg);
  const last7 = Array.from({ length: 7 }, (_, i) => { const k = addDays(todayKey(), i - 6); return { k, label: parseKey(k).toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3), kcal: totals(S.days[k]?.entries || []).kcal }; });
  const logged = last7.filter(d => d.kcal > 0);
  const avg = logged.length ? logged.reduce((a, d) => a + d.kcal, 0) / logged.length : 0;
  const deficitWeek = logged.reduce((a, d) => a + (t.tdee - d.kcal), 0);
  let streak = 0;
  { let k = todayKey(); if (!(S.days[k]?.entries.length)) k = addDays(k, -1); while ((S.days[k]?.entries.length || 0) > 0 && streak < 3650) { streak++; k = addDays(k, -1); } }
  // tendance réelle
  let eta = "";
  if (left > 0) {
    let rate = p.pace;
    const first = ws.find(w => (parseKey(ws[ws.length - 1].date) - parseKey(w.date)) / 86400000 <= 42) || ws[0];
    const days = (parseKey(ws[ws.length - 1].date) - parseKey(first.date)) / 86400000;
    if (ws.length >= 2 && days >= 10) { const real = ((first.kg - cw) / days) * 7; if (real > 0.05) rate = real; }
    const d = new Date(); d.setDate(d.getDate() + Math.ceil((left / rate) * 7));
    eta = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  app.innerHTML = `
    <div class="header"><div><div class="muted small">Depuis le ${parseKey(p.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div><h1>Progrès</h1></div>
      <button class="btn sm" id="addw">+ Pesée</button></div>
    <div class="card">
      <div class="stat-grid">
        <div class="stat"><b>${String(r1(cw)).replace(".", ",")} kg</b><span>Poids actuel</span></div>
        <div class="stat"><b style="color:var(--accent)">${lost > 0 ? "−" : ""}${String(Math.abs(lost)).replace(".", ",")} kg</b><span>${lost >= 0 ? "Perdus" : "Pris"} depuis le début</span></div>
        <div class="stat"><b>${left > 0 ? String(left).replace(".", ",") + " kg" : "🎉"}</b><span>${left > 0 ? "Encore à perdre" : "Objectif atteint !"}</span></div>
        <div class="stat"><b>${eta || "-"}</b><span>Objectif estimé</span></div>
      </div>
    </div>
    <div class="card"><h2>Poids</h2>${ws.length ? lineChart(ws.slice(-60), p.goalWeightKg) : `<p class="muted">Pèse-toi pour voir ta courbe.</p>`}
      ${ws.length < 3 ? `<p class="small muted">Astuce : pèse-toi le matin à jeun, 1 à 2 fois par semaine.</p>` : ""}</div>
    <div class="card"><h2>Calories, 7 derniers jours</h2>${barChart(last7, t.kcal)}
      <div class="stat-grid" style="margin-top:10px">
        <div class="stat"><b>${fmtNum(avg)}</b><span>Moyenne kcal / jour suivi</span></div>
        <div class="stat"><b>${streak} j</b><span>Série de jours suivis 🔥</span></div>
        <div class="stat"><b>${deficitWeek > 0 ? fmtNum(deficitWeek) : 0}</b><span>Déficit cumulé (kcal)</span></div>
        <div class="stat"><b>≈ ${String(r1(Math.max(0, deficitWeek) / 7700)).replace(".", ",")} kg</b><span>Graisse brûlée estimée</span></div>
      </div>
    </div>
    ${ws.length ? `<div class="card"><h2>Historique</h2>${[...ws].reverse().slice(0, 12).map(w => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span>${parseKey(w.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span><span class="row"><b>${String(w.kg).replace(".", ",")} kg</b><button class="btn sm ghost" data-delw="${w.date}" aria-label="Supprimer">✕</button></span></div>`).join("")}</div>` : ""}`;
  $("#addw").onclick = openWeight;
  $$("[data-delw]").forEach(b => (b.onclick = () => { if (S.weights.length <= 1) return toast("Garde au moins une pesée"); S.weights = S.weights.filter(w => w.date !== b.dataset.delw); save(); render(); }));
}
function openWeight() {
  openSheet(`<h2>Nouvelle pesée</h2>
    ${ruler({ name: "w", label: "Poids", unit: "kg", min: 30, max: 200, step: 0.1, value: r1(currentWeight()) })}
    <label class="field" style="margin-top:12px"><span>Date</span><input class="input" id="d" type="date" value="${todayKey()}" max="${todayKey()}"></label>
    <button class="btn" id="ok" style="margin-top:14px">Enregistrer</button>`, (s, close) => {
    bindRulers(s);
    $("#ok", s).onclick = () => {
      const kg = parseFloat($("[name=w]", s).value); const date = $("#d", s).value || todayKey();
      if (!(kg > 25 && kg < 350)) return toast("Poids invalide");
      const prev = currentWeight();
      S.weights = S.weights.filter(w => w.date !== date); S.weights.push({ date, kg }); save();
      close(); render();
      toast(kg < prev ? `Bravo ! −${String(r1(prev - kg)).replace(".", ",")} kg 💪` : "Pesée enregistrée");
    };
  });
}

/* ---------- Aliments ---------- */
function renderFoods(app) {
  app.innerHTML = `
    <div class="header"><h1>Aliments</h1></div>
    <div class="card"><button class="btn secondary" id="s">${ICON.search} Rechercher un aliment</button>
      <div class="btns two" style="margin-top:10px"><button class="btn ghost" id="b">${ICON.barcode} Scanner</button><button class="btn ghost" id="n">+ Créer</button></div></div>
    <div class="card"><h2>⭐ Mes aliments</h2>${S.custom.length ? S.custom.map(foodRow).join("") : `<p class="muted small">Crée tes recettes ou plats habituels pour les ajouter en un geste.</p>`}</div>
    <div class="card"><h2>Récents</h2>${S.recent.length ? S.recent.slice(0, 20).map(foodRow).join("") : `<p class="muted small">Les aliments que tu ajoutes apparaîtront ici.</p>`}</div>`;
  const all = new Map([...S.custom, ...S.recent].map(f => [f.id, f]));
  $$("[data-food]").forEach(b => (b.onclick = () => openFoodManage(all.get(b.dataset.food))));
  $("#s").onclick = () => openSearch(defaultMeal());
  $("#b").onclick = () => openScanner(defaultMeal());
  $("#n").onclick = openCreateFood;
}
function openFoodManage(f) {
  const isCustom = f.source === "custom";
  openFood(f, curDate === todayKey() ? defaultMeal() : "lunch");
  const s = $$(".sheet").pop();
  const b = document.createElement("button");
  b.className = "btn danger"; b.style.marginTop = "10px"; b.textContent = isCustom ? "Supprimer de mes aliments" : "Retirer des récents";
  b.onclick = () => { if (isCustom) S.custom = S.custom.filter(x => x.id !== f.id); else S.recent = S.recent.filter(x => x.id !== f.id); save(); closeAllSheets(); render(); };
  s.appendChild(b);
}
function openCreateFood() {
  openSheet(`<h2>Créer un aliment</h2>
    <div class="stack">
      <label class="field"><span>Nom</span><input class="input" id="n" placeholder="Ex. : Mon porridge du matin"></label>
      <div class="seg" id="mode"><button type="button" class="on" data-v="portion">Par portion</button><button type="button" data-v="100">Pour 100 g</button></div>
      <label class="field" id="pg"><span>Poids d'une portion (g)</span><input class="input" id="g" type="number" inputmode="decimal" value="100"></label>
      <div class="grid2"><label class="field"><span>Calories (kcal)</span><input class="input" id="k" type="number" inputmode="decimal"></label>
      <label class="field"><span>Protéines (g)</span><input class="input" id="p" type="number" inputmode="decimal"></label>
      <label class="field"><span>Glucides (g)</span><input class="input" id="c" type="number" inputmode="decimal"></label>
      <label class="field"><span>Lipides (g)</span><input class="input" id="f" type="number" inputmode="decimal"></label></div>
      <button class="btn" id="ok">Enregistrer</button>
    </div>`, (s, close) => {
    let mode = "portion";
    $$("#mode button", s).forEach(b => (b.onclick = () => { mode = b.dataset.v; $$("#mode button", s).forEach(x => x.classList.toggle("on", x === b)); }));
    $("#ok", s).onclick = () => {
      const n = id => parseFloat($(id, s).value.replace(",", ".")) || 0;
      const name = $("#n", s).value.trim(); if (!name) return toast("Donne un nom");
      const g = mode === "portion" ? Math.max(1, n("#g")) : 100;
      const k = 100 / g;
      S.custom.unshift({ id: "custom-" + uid(), name, brand: "", per100: { kcal: r0(n("#k") * k), p: r1(n("#p") * k), c: r1(n("#c") * k), f: r1(n("#f") * k) }, servingG: g, servingLabel: "1 portion", source: "custom" });
      save(); close(); render(); toast("Aliment créé");
    };
  });
}


/* ---------- Conseils : plats sains et sport ---------- */
let tipsView = "food";
let recipeFilter = "auto";
function fitnessLevel() {
  const a = S.profile.activity;
  return a <= 1.2 ? 0 : a <= 1.375 ? (S.profile.age >= 55 ? 0 : 1) : a <= 1.55 ? 1 : 2;
}
function sessionKcal(sess) { return r0((sess.met * currentWeight() * sess.min) / 60); }
function weekKey(k) { const d = parseKey(k); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return keyOf(d); }
function renderTips(app) {
  app.innerHTML = `
    <div class="header"><div><div class="muted small">Adapté à ton objectif</div><h1>Conseils</h1></div></div>
    <div class="seg" id="tv" style="margin-bottom:14px"><button data-v="food" class="${tipsView === "food" ? "on" : ""}">🥗 Plats sains</button><button data-v="sport" class="${tipsView === "sport" ? "on" : ""}">💪 Exercices</button></div>
    <div id="tips-body"></div>`;
  $$("#tv button").forEach(b => (b.onclick = () => { tipsView = b.dataset.v; renderTips(app); }));
  if (tipsView === "food") renderRecipes($("#tips-body")); else renderSport($("#tips-body"));
}
function renderRecipes(el) {
  const t = targets();
  const tot = totals(day(todayKey()).entries);
  const left = t.kcal - tot.kcal;
  const protLeft = t.prot - tot.p;
  const next = defaultMeal();
  const meal = recipeFilter === "auto" ? next : recipeFilter;
  let list = RECIPES.filter(r => recipeFilter === "all" || r.meal === meal);
  const highProt = protLeft > t.prot * 0.5;
  list = [...list].sort((a, b) => (recipeFilter === "auto" ? (Math.abs(a.kcal - Math.min(left, 600)) - Math.abs(b.kcal - Math.min(left, 600))) : 0) + (highProt ? (b.p - a.p) * 2 : 0));
  const fits = r => r.kcal <= Math.max(left, 0) + 30;
  let intro;
  if (left <= 120) intro = `Tu as presque atteint ton objectif du jour (${fmtNum(Math.max(left, 0))} kcal restantes). Si tu as faim, mise sur une collation très légère : légumes croquants, tisane, fromage blanc 0 %.`;
  else intro = `Il te reste <b>${fmtNum(left)} kcal</b> aujourd'hui${protLeft > 10 ? ` et <b>${r0(protLeft)} g de protéines</b> à aller chercher` : ""}. Voici des idées pour ${mealName(next).toLowerCase() === "collations" ? "ta collation" : "ton " + mealName(next).toLowerCase()}${highProt ? ", riches en protéines pour rester rassasiée" : ""}.`;
  el.innerHTML = `
    <div class="banner"><div style="font-size:24px">💡</div><div>${intro}</div></div>
    <div class="chips" id="rf" style="margin-bottom:12px">
      ${[["auto", "Pour maintenant"], ...MEALS.map(m => [m.id, m.name]), ["all", "Tout"]].map(([v, l]) => `<button class="chip ${recipeFilter === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}
    </div>
    ${list.map(r => `<button class="card recipe" data-r="${r.id}">
      <div class="row"><div class="rec-emoji">${r.emoji}</div><div class="grow"><div style="font-weight:700">${esc(r.name)}</div>
        <div class="small muted">${mealName(r.meal)} · ${r.min} min${r.tags.includes("veggie") ? " · 🌱" : ""}</div>
        <div class="small" style="margin-top:4px"><b>${r.kcal} kcal</b> <span class="muted">· P ${r.p} · G ${r.c} · L ${r.f}</span></div>
        <div style="margin-top:6px">${fits(r) ? `<span class="badge">✓ Rentre dans ton budget</span>` : `<span class="badge warn">Dépasse ton budget du jour</span>`}</div></div></div>
    </button>`).join("")}
    <p class="small muted" style="text-align:center">Valeurs indicatives pour une portion.</p>`;
  $$("#rf .chip", el).forEach(b => (b.onclick = () => { recipeFilter = b.dataset.v; renderRecipes(el); }));
  $$("[data-r]", el).forEach(b => (b.onclick = () => openRecipe(RECIPES.find(r => r.id === b.dataset.r))));
}
function openRecipe(r) {
  openSheet(`
    <div class="row" style="margin-bottom:10px"><div class="rec-emoji big">${r.emoji}</div><div class="grow"><h2 style="margin:0">${esc(r.name)}</h2><div class="small muted">${mealName(r.meal)} · ${r.min} min · 1 portion</div></div></div>
    <div class="kv"><div><b>${r.kcal}</b><span>kcal</span></div><div><b>${r.p}</b><span>Prot. (g)</span></div><div><b>${r.c}</b><span>Gluc. (g)</span></div><div><b>${r.f}</b><span>Lip. (g)</span></div></div>
    <h3 style="margin:16px 0 6px">Ingrédients</h3><ul class="steps">${r.ing.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
    <h3 style="margin:12px 0 6px">Préparation</h3><p style="margin:0 0 16px;font-size:15px">${esc(r.steps)}</p>
    <label class="field" style="margin-bottom:12px"><span>Ajouter à</span><select class="input" id="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === (curDate === todayKey() ? defaultMeal() : r.meal) ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>
    <button class="btn" id="add">J'ai mangé ça</button>`, (s, close) => {
    $("#add", s).onclick = () => {
      curDate = todayKey();
      addEntry({ meal: $("#meal", s).value, name: r.name, kcal: r.kcal, p: r.p, c: r.c, f: r.f, source: "recette", emoji: r.emoji });
      close(); toast(`Ajouté : ${r.kcal} kcal`); setTab("today");
    };
  });
}
function renderSport(el) {
  const p = S.profile;
  const lvl = fitnessLevel();
  const plan = PLANS[lvl];
  const left = r1(currentWeight() - p.goalWeightKg);
  const wk = weekKey(todayKey());
  let done = 0, burned = 0;
  for (let i = 0; i < 7; i++) { const k = addDays(wk, i); (S.days[k]?.activities || []).forEach(a => { done++; burned += a.kcal; }); }
  const focus = left > 10 ? "Avec plus de 10 kg à perdre, privilégie les activités douces pour les articulations (marche, vélo, danse) et ajoute du renforcement pour garder tes muscles."
    : left > 3 ? "Combine cardio et renforcement : c'est le duo le plus efficace pour perdre du gras et affiner la silhouette."
    : left > 0 ? "Tu es proche du but : le renforcement musculaire va tonifier et sculpter, la balance bougera moins mais ton corps changera."
    : "Objectif atteint : garde ce rythme pour stabiliser ton poids durablement.";
  const sessions = plan.week.map(id => SESSIONS.find(x => x.id === id));
  const others = SESSIONS.filter(x => x.levels.includes(lvl) && !plan.week.includes(x.id));
  const sessCard = x => `<button class="card recipe" data-s="${x.id}"><div class="row"><div class="rec-emoji">${x.emoji}</div><div class="grow"><div style="font-weight:700">${esc(x.name)}</div>
      <div class="small muted">${x.min} min · ≈ ${fmtNum(sessionKcal(x))} kcal</div></div><span class="badge">${{ cardio: "Cardio", renfo: "Renfo", doux: "Récup" }[x.kind]}</span></div></button>`;
  el.innerHTML = `
    <div class="card">
      <div class="row between"><div><div class="muted small">Ton programme</div><div style="font-family:var(--serif);font-size:22px;font-weight:700">Niveau ${p.sex === "m" ? plan.levelM : plan.level}</div></div>
        <div style="text-align:right"><div style="font-family:var(--serif);font-size:22px;font-weight:700;color:var(--accent)">${done} / ${plan.perWeek}</div><div class="small muted">séances cette semaine</div></div></div>
      <div class="pbar" style="margin-top:10px"><i style="width:${Math.min(100, (done / plan.perWeek) * 100)}%"></i></div>
      <p class="small" style="margin:12px 0 0">${plan.text} ${focus}</p>
      ${burned ? `<p class="small muted" style="margin:8px 0 0">Cette semaine : ≈ ${fmtNum(burned)} kcal dépensées en plus 🔥</p>` : ""}
    </div>
    <h2 style="margin:18px 0 10px">Ta semaine type</h2>
    ${sessions.map(sessCard).join("")}
    ${others.length ? `<h2 style="margin:18px 0 10px">Pour varier</h2>${others.map(sessCard).join("")}` : ""}
    <p class="small muted" style="text-align:center">Calories estimées selon ton poids. Les dépenses ne sont pas ajoutées à ton objectif calorique : ton niveau d'activité est déjà pris en compte, c'est donc un bonus pour ton déficit. En cas de douleur ou de problème de santé, demande l'avis d'un médecin.</p>`;
  $$("[data-s]", el).forEach(b => (b.onclick = () => openSession(SESSIONS.find(x => x.id === b.dataset.s))));
}
function openSession(x) {
  openSheet(`
    <div class="row" style="margin-bottom:10px"><div class="rec-emoji big">${x.emoji}</div><div class="grow"><h2 style="margin:0">${esc(x.name)}</h2><div class="small muted">${x.min} min · ≈ ${fmtNum(sessionKcal(x))} kcal pour toi</div></div></div>
    <p style="margin:0 0 12px">${esc(x.desc)}</p>
    ${x.moves.length ? `<div class="stack" style="margin-bottom:16px">${x.moves.map((m, i) => `<div class="move"><span class="num">${i + 1}</span><div><b>${esc(MOVES[m].name)}</b><div class="small muted">${esc(MOVES[m].how)}</div></div></div>`).join("")}</div>` : ""}
    <label class="field" style="margin-bottom:12px"><span>Durée réelle</span><select class="input" id="dur">${[10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 90].map(m => `<option value="${m}" ${m === x.min ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
    <button class="btn" id="done">C'est fait ✓</button>`, (s, close) => {
    $("#done", s).onclick = () => {
      const min = +$("#dur", s).value;
      const kcal = r0((x.met * currentWeight() * min) / 60);
      const d = day(todayKey());
      (d.activities ||= []).push({ id: uid(), sid: x.id, name: x.name, emoji: x.emoji, min, kcal, time: Date.now() });
      save(); close(); render(); toast(`Bravo ! ≈ ${fmtNum(kcal)} kcal dépensées 💪`);
    };
  });
}

/* ---------- Profil ---------- */
function renderProfile(app) {
  const t = targets();
  app.innerHTML = `
    <div class="header"><h1>Profil</h1></div>
    <div class="card">
      <div class="row between"><div><div class="muted small">Objectif quotidien</div><div style="font-size:28px;font-weight:800;letter-spacing:-.02em">${fmtNum(t.kcal)} kcal</div></div><button class="btn sm secondary" id="det">Détails</button></div>
      <div class="kv" style="margin-top:12px"><div><b>${t.prot} g</b><span>Protéines</span></div><div><b>${t.carbs} g</b><span>Glucides</span></div><div><b>${t.fat} g</b><span>Lipides</span></div><div><b>${fmtNum(t.tdee)}</b><span>Dépense</span></div></div>
      <label class="field" style="margin-top:14px"><span>Objectif personnalisé (laisser vide = calcul automatique)</span>
        <div class="row"><input class="input" id="ovr" type="number" inputmode="numeric" placeholder="Auto" value="${S.settings.targetOverride || ""}"><button class="btn sm" id="ovr-ok">OK</button></div></label>
    </div>
    <div class="card"><button class="btn ghost" id="myfoods">⭐ Mes aliments et récents</button></div>
    <form class="card" id="pf"><h2>Mes infos</h2>${profileForm({ ...S.profile, weightKg: r1(currentWeight()) })}<button class="btn" style="margin-top:14px" type="submit">Mettre à jour</button></form>
    <div class="card">
      <h2>📸 Reconnaissance photo (IA)</h2>
      <p class="small muted" style="margin-top:-4px">${S.settings.geminiKey ? `Activée ✅ ${S.settings.models?.[0] ? `(modèle ${esc(S.settings.models[0])})` : ""}` : "Pas encore activée. Gratuit, 1 minute."}</p>
      <button class="btn ${S.settings.geminiKey ? "ghost" : ""}" id="key">${S.settings.geminiKey ? "Gérer ma clé" : "Activer la reconnaissance photo"}</button>
    </div>
    <div class="card">
      <h2>👯 Partager avec mes amis</h2>
      <p class="small muted" style="margin-top:-4px">L'appli est gratuite. Envoie le lien : ils l'installent sur leur écran d'accueil, et chacun garde ses propres données.</p>
      <div class="btns two"><button class="btn" id="share">${ICON.share} Partager</button><button class="btn ghost" id="copy">${ICON.copy} Copier le lien</button></div>
      <button class="btn ghost" id="install" style="margin-top:10px">Installer sur mon téléphone</button>
    </div>
    <div class="card">
      <h2>💾 Mes données</h2>
      <p class="small muted" style="margin-top:-4px">Tout est enregistré sur ce téléphone uniquement. Fais une sauvegarde de temps en temps, ou pour changer de téléphone.</p>
      <div class="btns two"><button class="btn ghost" id="exp">Sauvegarder</button><button class="btn ghost" id="imp">Restaurer</button></div>
      <button class="btn danger" id="reset" style="margin-top:10px">Tout effacer</button>
    </div>
    <p class="small muted" style="text-align:center">Mycals · données produits <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL) · IA Google Gemini<br>Les estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.</p>`;
  const pf = $("#pf"); bindProfileForm(pf);
  pf.onsubmit = e => {
    e.preventDefault();
    const p = readProfileForm(pf); if (!p) return;
    const wChanged = p.weightKg !== currentWeight();
    S.profile = { ...S.profile, ...p };
    if (wChanged) { S.weights = S.weights.filter(w => w.date !== todayKey()); S.weights.push({ date: todayKey(), kg: p.weightKg }); }
    save(); showTargetResult(false);
  };
  $("#det").onclick = () => showTargetResult(false);
  $("#myfoods").onclick = () => setTab("foods");
  $("#ovr-ok").onclick = () => { const v = parseInt($("#ovr").value, 10); S.settings.targetOverride = v >= 800 && v <= 6000 ? v : null; save(); render(); toast(S.settings.targetOverride ? "Objectif personnalisé enregistré" : "Calcul automatique"); };
  $("#key").onclick = () => openKeySetup();
  $("#share").onclick = shareApp;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(APP_URL); toast("Lien copié"); } catch { prompt("Copie ce lien :", APP_URL); } };
  $("#install").onclick = showInstallHelp;
  $("#exp").onclick = exportData;
  $("#imp").onclick = () => { const i = $("#import-input"); i.value = ""; i.onchange = importData; i.click(); };
  $("#reset").onclick = () => {
    openSheet(`<h2>Tout effacer ?</h2><p class="muted">Ton profil, ton journal et tes pesées seront supprimés de ce téléphone. Fais une sauvegarde avant si tu veux les garder.</p>
      <div class="btns two"><button class="btn ghost" data-close>Annuler</button><button class="btn" style="background:var(--danger)" id="y">Effacer</button></div>`, (s, close) => {
      $("#y", s).onclick = () => { const key = S.settings.geminiKey; S = blank(); S.settings.geminiKey = key; save(); close(); tab = "today"; render(); };
    });
  };
}
async function shareApp() {
  const data = { title: "Mycals", text: "Je suis mes calories avec Mycals : photo de l'assiette, scan des codes-barres, c'est gratuit !", url: APP_URL };
  if (navigator.share) { try { await navigator.share(data); } catch {} }
  else { try { await navigator.clipboard.writeText(APP_URL); toast("Lien copié, colle-le à tes amis"); } catch { prompt("Copie ce lien :", APP_URL); } }
}
function exportData() {
  const blob = new Blob([JSON.stringify({ ...S, settings: { ...S.settings, geminiKey: "" } }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mycals-sauvegarde-${todayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Sauvegarde téléchargée");
}
async function importData() {
  const f = $("#import-input").files?.[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || typeof data !== "object" || !("days" in data)) throw new Error();
    const key = S.settings.geminiKey;
    S = Object.assign(blank(), data); S.settings = { ...blank().settings, ...data.settings, geminiKey: key || data.settings?.geminiKey || "" };
    save(); render(); toast("Données restaurées ✅");
  } catch { toast("Fichier de sauvegarde invalide"); }
}

/* ---------- Installation (PWA) ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; if (tab === "today") render(); });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function installBanner() {
  if (isStandalone() || S.settings.hideInstall) return "";
  if (!deferredPrompt && !isIOS()) return "";
  return `<div class="banner" id="ib"><div style="font-size:24px">📲</div><div><b>Installe Mycals</b><br>${isIOS() ? "Pour l'avoir comme une vraie appli : bouton Partager puis « Sur l'écran d'accueil »." : "Ajoute-la sur ton écran d'accueil en un geste."}
    <div style="margin-top:8px"><button class="btn sm" id="ib-go">${isIOS() ? "Voir comment" : "Installer"}</button></div></div><button class="x" id="ib-x" aria-label="Masquer">×</button></div>`;
}
function bindInstallBanner() {
  const x = $("#ib-x"); if (x) x.onclick = () => { S.settings.hideInstall = true; save(); render(); };
  const g = $("#ib-go"); if (g) g.onclick = showInstallHelp;
}
async function showInstallHelp() {
  if (isStandalone()) return toast("Mycals est déjà installée 👍");
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => {}); deferredPrompt = null; render(); return; }
  openSheet(`<h2>Installer Mycals</h2>
    <h3 style="margin-top:6px">Sur iPhone (Safari)</h3>
    <ol class="steps"><li>Ouvre ce lien dans <b>Safari</b>.</li><li>Appuie sur le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</li></ol>
    <h3>Sur Android (Chrome)</h3>
    <ol class="steps"><li>Ouvre le menu <b>⋮</b> en haut à droite.</li><li>Appuie sur <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>.</li></ol>
    <button class="btn" data-close style="margin-top:8px">Compris</button>`);
}

/* ---------- Démarrage ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.__mycals = { get state() { return S; }, render };
render();
