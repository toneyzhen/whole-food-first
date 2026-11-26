/* ---------------- persistence ---------------- */
function persistLocal(){
  try { localStorage.setItem("completeday", JSON.stringify({plan, meals, rowOrder, addMeal, profile, recent,
    avoid:[...avoid], sugOff:[...sugOff],
    saved: savedCache.filter(x => x.id.startsWith("local-"))})); } catch (e) {}
}
const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
function restoreLocal(){
  try {
    const s = JSON.parse(localStorage.getItem("completeday") || "null");
    if (s && s.plan){ plan = knownOnly(s.plan); meals = cleanMeals(s.meals); rowOrder = cleanOrder(s.rowOrder);
      noteRemoved(s.plan);
      // before this list existed, start it from the foods in the current day
      recent = Array.isArray(s.recent) ? cleanRecent(s.recent) : cleanRecent(Object.keys(plan));
      if (MEALS[s.addMeal]) addMeal = s.addMeal;
      if (s.profile) profile = s.profile;
      if (s.avoid) avoid = new Set(s.avoid);
      if (s.sugOff) sugOff = new Set(s.sugOff); }
    if (s && Array.isArray(s.saved)) savedCache = s.saved;
  } catch (e) {}
  renderSaved(savedCache);
  document.getElementById("sex").value = profile.sex;
  document.getElementById("age").value = String(profile.age);
  document.getElementById("kcal").value = profile.kcal;
}
function renderSaved(docs){
  const card = document.getElementById("savedcard");
  if (!docs.length){ card.hidden = true; return; }
  card.hidden = false;
  document.getElementById("savedlist").innerHTML = docs.map(d =>
    `<span class="chipbtn"><button style="all:unset;cursor:pointer" data-open="${esc(d.id)}"><b>${
      esc(d.name)}</b> &middot; ${esc(d.count)} foods</button>
     <button class="x" data-drop="${esc(d.id)}" aria-label="Delete ${esc(d.name)}">&times;</button></span>`).join("");
}
let savedCache = [];
async function initDb(){
  if (!window.claude || !window.claude.use) return;
  try { DB = await window.claude.use("db"); } catch (e) { DB = null; }
  if (!DB) return;
  try {
    DB.collection("plans").onSnapshot(snap => {
      savedCache = savedCache.filter(x => x.id.startsWith("local-")).concat(snap.docs.map(d => {
        const v = d.data() || {};
        return {id: d.id, name: v.name || "Untitled", plan: v.plan || {}, meals: v.meals || {}, order: cleanOrder(v.order),
                count: Object.keys(v.plan || {}).length};
      }));
      renderSaved(savedCache);
    }, () => {});
  } catch (e) {}
}
const saveForm = document.getElementById("saveform"), saveName = document.getElementById("savename"),
      saveBtn = document.getElementById("btn-save");
function showSaveForm(open){
  saveForm.hidden = !open; saveBtn.setAttribute("aria-expanded", String(open));
  if (open){ saveName.value = new Date().toLocaleDateString(); saveName.focus(); saveName.select(); }
}
saveBtn.addEventListener("click", () => {
  if (!Object.keys(plan).length) return;
  showSaveForm(saveForm.hidden);
});
document.getElementById("savecancel").addEventListener("click", () => { showSaveForm(false); saveBtn.focus(); });
saveName.addEventListener("keydown", e => { if (e.key === "Escape"){ showSaveForm(false); saveBtn.focus(); } });
saveForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = saveName.value.trim();
  if (!name || !Object.keys(plan).length) return;
  showSaveForm(false);
  const entry = {name, plan: Object.assign({}, plan), meals: JSON.parse(JSON.stringify(meals)), order: rowOrder.slice()};
  if (DB){
    try { await DB.collection("plans").add(Object.assign({profile, ts: Date.now()}, entry)); return; }
    catch (e) {}
  }
  savedCache = savedCache.concat([Object.assign({id: "local-" + Date.now(),
    count: Object.keys(plan).length}, entry)]);
  renderSaved(savedCache); persistLocal();
});
document.getElementById("savedlist").addEventListener("click", async e => {
  const o = e.target.closest("[data-open]"), d = e.target.closest("[data-drop]");
  if (o){
    const s = savedCache.find(x => x.id === o.dataset.open);
    if (s){ plan = knownOnly(s.plan); meals = cleanMeals(s.meals); rowOrder = cleanOrder(s.order);
      noteRemoved(s.plan); renderPlan(); }
  } else if (d){
    const id = d.dataset.drop;
    if (DB && !id.startsWith("local-")){ try { await DB.doc("plans/" + id).delete(); } catch (e) {} }
    savedCache = savedCache.filter(x => x.id !== id);
    renderSaved(savedCache); persistLocal();
  }
});

/* ---------------- your own foods: form ---------------- */
const CF_CORE = ["kcal","fat","Na","carb","fiber","protein","D","Ca","Fe","K"];   // label order
const cfField = n => `<div class="fld"><label for="cf-n-${n}">${META[n].label} (${META[n].unit})</label>
  <input id="cf-n-${n}" data-cfn="${n}" type="number" min="0" step="any" inputmode="decimal"
    ${n === "kcal" || n === "Na" ? "required" : ""}></div>`;
document.getElementById("cf-core").innerHTML = CF_CORE.map(cfField).join("");
document.getElementById("cf-more").innerHTML = ORDER.filter(n => !CF_CORE.includes(n)).map(cfField).join("");
const cfTags = new Set();
document.getElementById("cftags").innerHTML = AVOIDABLE.map(([t, label]) =>
  `<button type="button" class="chip" data-cftag="${t}" aria-pressed="false">${label}</button>`).join("");
document.getElementById("cftags").addEventListener("click", e => {
  const c = e.target.closest("[data-cftag]"); if (!c) return;
  const t = c.dataset.cftag;
  if (cfTags.has(t)) cfTags.delete(t); else cfTags.add(t);
  c.setAttribute("aria-pressed", String(cfTags.has(t)));
});
function renderCustomList(){
  const list = customFoods();
  document.getElementById("cflistwrap").hidden = !list.length;
  document.getElementById("cflist").innerHTML = list.map(f =>
    `<span class="chipbtn"><b>${f.name}</b>&nbsp;&middot; ${f.sl}
     <button class="x" data-cfdel="${f.k}" aria-label="Delete ${f.name}">&times;</button></span>`).join("");
}
function foodsChanged(){
  SCARCE = scarcityFor(ALLKEYS); fillCats(); renderCustomList();
  if (!document.getElementById("p-browse").hidden) renderBrowse();
}
document.getElementById("cfform").addEventListener("submit", e => {
  e.preventDefault();
  const val = id => document.getElementById(id).value.trim();
  const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : NaN; };
  const err = msg => { document.getElementById("cf-err").textContent = msg; };
  const name = cleanText(val("cf-name")), serv = num(val("cf-serv"));
  if (!name) return err("Give the food a name.");
  if (!(serv > 0 && serv <= 1000)) return err("Serving weight must be between 1 and 1000 g (it is printed next to the serving size).");
  const per = {};
  for (const n of ORDER){
    const raw = document.getElementById("cf-n-" + n).value.trim();
    const v = raw === "" ? 0 : num(raw);
    if (!(v >= 0)) return err(`${META[n].label} must be a number of zero or more.`);
    per[n] = v;
  }
  if (val("cf-n-kcal") === "") return err("Calories are required.");
  if (val("cf-n-Na") === "") return err("Sodium is required: it is a ceiling, so a blank would err in the unsafe direction.");
  if (per.fiber > per.carb) return err("Fiber can't be more than total carbohydrate.");
  const cls = document.getElementById("cf-cls").value;
  const tags = new Set(cfTags); if (CLS_TAG[cls]) tags.add(CLS_TAG[cls]);
  const f = normCustom({k: "c-" + Date.now().toString(36), name, cls, serv, sl: val("cf-sl"),
    tags: [...tags].join(" "), n: ORDER.map(n => per[n] * 100 / serv)});
  if (!f) return err("Couldn't save that food; check the numbers.");
  err("");
  FOODS.push(f); BY[f.k] = f; ALLKEYS.push(f.k);
  saveCustom(); foodsChanged();
  addFood(f.k);
  e.target.reset(); cfTags.clear();
  document.querySelectorAll("[data-cftag]").forEach(c => c.setAttribute("aria-pressed", "false"));
});
document.getElementById("cflist").addEventListener("click", e => {
  const d = e.target.closest("[data-cfdel]"); if (!d) return;
  const k = d.dataset.cfdel, f = BY[k];
  if (!f || !confirm(`Delete "${f.name}"? It will also be removed from today's food.`)) return;
  FOODS.splice(FOODS.indexOf(f), 1); ALLKEYS.splice(ALLKEYS.indexOf(k), 1); delete BY[k];
  delete plan[k]; delete meals[k];
  saveCustom(); foodsChanged(); renderPlan();
});

/* ---------------- share links and backups ---------------- */
// A share link carries the day in the URL fragment (after #), which browsers never send to a
// server, so sharing uploads nothing. Links and backup files are untrusted input and go
// through the same checks as storage: foods via normCustom, plans via knownOnly, meals via
// cleanMeals, saved days rebuilt field by field.
const b64enc = s => { let t = ""; new TextEncoder().encode(s).forEach(x => t += String.fromCharCode(x));
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64dec = s => new TextDecoder().decode(
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));
const foodRecord = ({cat, raw, custom, ...f}) => f;   // what saveCustom stores
// meals from outside: a split {meal: grams} per food, or an older single meal index; own keys of
// known foods only, so "__proto__" in a link can't reach the result's prototype
const cleanMeals = m => { const out = {};
  if (m && typeof m === "object") for (const k0 in m){
    const k = renamed(k0);
    // first one wins when an old and a new key both appear; fillMeals rescales to the plan total
    if (!Object.prototype.hasOwnProperty.call(BY, k) || k in out) continue;
    const v = m[k0];
    if (Number.isInteger(v) && MEALS[v]){ out[k] = v; continue; }
    if (!v || typeof v !== "object") continue;
    const s = {}; MEAL_IDS.forEach(i => { if (+v[i] > 0) s[i] = +v[i]; });
    if (Object.keys(s).length) out[k] = s;
  }
  return out; };
function importFoods(list){
  const fresh = (Array.isArray(list) ? list : []).slice(0, 200).map(normCustom).filter(Boolean);
  fresh.forEach(f => { FOODS.push(f); BY[f.k] = f; ALLKEYS.push(f.k); });
  if (fresh.length){ saveCustom(); foodsChanged(); }
  return fresh.length;
}
function shareURL(){
  const used = customFoods().filter(f => f.k in plan).map(foodRecord);
  return location.href.split("#")[0] + "#day=" + b64enc(JSON.stringify({v: 1, plan, meals, order: rowOrder, foods: used}));
}
function readShared(){
  const m = location.hash.match(/^#day=([A-Za-z0-9_-]{1,20000})$/);
  if (!m) return null;
  try { const d = JSON.parse(b64dec(m[1])); return d && typeof d === "object" ? d : null; }
  catch (e) { return null; }
}
const dropHash = () => history.replaceState(null, "", location.pathname + location.search);
document.getElementById("btn-share").addEventListener("click", async () => {
  if (!Object.keys(plan).length) return;
  const box = document.getElementById("sharebox"), field = document.getElementById("sharefield"),
        msg = document.getElementById("sharemsg");
  field.value = shareURL(); box.hidden = false;
  try { await navigator.clipboard.writeText(field.value);
        msg.textContent = "Link copied. Whoever opens it gets this day; nothing is uploaded."; }
  catch (e) { msg.textContent = "Copy this link:"; field.focus(); field.select(); }
});
document.getElementById("btn-backup").addEventListener("click", () => {
  const data = {app: "the-complete-day", v: 1, exported: new Date().toISOString(), plan, meals, order: rowOrder, profile,
    saved: savedCache.map(({id, count, ...s}) => s), foods: customFoods().map(foodRecord)};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], {type: "application/json"}));
  const a = document.createElement("a");
  a.href = url; a.download = `whole-food-first-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const restoreFile = document.getElementById("restorefile");
document.getElementById("btn-restore").addEventListener("click", () => restoreFile.click());
restoreFile.addEventListener("change", async () => {
  const msg = t => { document.getElementById("restoremsg").textContent = t; };
  const file = restoreFile.files[0]; restoreFile.value = "";
  if (!file) return;
  if (file.size > 2e6) return msg("That file is too large to be a backup from this app.");
  let d; try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
  // the app id stays "the-complete-day" (the old name), so backups from before the rename still restore
  if (!d || d.app !== "the-complete-day") return msg("That isn't a backup file from Whole Food First.");
  const nFoods = importFoods(d.foods);   // first, so saved days that use them survive knownOnly
  // Restoring adds; it never overwrites. The backup's current day comes back as a saved day.
  const incoming = (Array.isArray(d.saved) ? d.saved.slice(0, 500) : [])
    .concat(d.plan ? [{name: "Current day from backup " + String(d.exported || "").slice(0, 10), plan: d.plan, meals: d.meals, order: d.order}] : []);
  const seen = new Set(savedCache.map(s => s.name + JSON.stringify(knownOnly(s.plan))));
  let nDays = 0;
  const left = new Set();   // ultra-processed foods the backup's days used, named in the message
  incoming.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    removedNames(s.plan).forEach(n => left.add(n));
    const p = knownOnly(s.plan); if (!Object.keys(p).length) return;
    const name = String(s.name || "Restored day").slice(0, 60), sig = name + JSON.stringify(p);
    if (seen.has(sig)) return;
    seen.add(sig); nDays++;
    savedCache.push({id: `local-${Date.now()}-${i}`, name, plan: p, meals: cleanMeals(s.meals), order: cleanOrder(s.order),
      count: Object.keys(p).length});
  });
  renderSaved(savedCache); persistLocal();
  const gone = left.size ? ` Left out because they are ultra-processed (NOVA group 4) and no longer in the app: ${
    [...left].join(", ")}.` : "";
  msg((nDays || nFoods ? `Restored ${nDays} saved day${nDays === 1 ? "" : "s"} and ${nFoods} food${nFoods === 1 ? "" : "s"} of your own.`
      : left.size ? "Nothing restored." : "Nothing new in that file: everything in it is already here.") + gone);
});

