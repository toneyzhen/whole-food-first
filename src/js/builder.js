/* ---------------- plan list ---------------- */
const GRIP = `<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" fill="currentColor">
  <circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/>
  <circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/></svg>`;
// The plan is an object whose key order is the display order, so reordering = rebuilding it.
function setOrder(keys){
  const next = {};
  keys.forEach(k => { if (k in plan) next[k] = plan[k]; });
  Object.keys(plan).forEach(k => { if (!(k in next)) next[k] = plan[k]; });
  plan = next;
}
/* ---------------- meals ---------------- */
const kcalOf = (k, g) => BY[k].n[IDX.kcal] * g / 100;
const BREAKFASTY = /oat|cereal|granola|muesli|bread|bagel|muffin|yogurt|milk|kefir|juice|bran/i;
// A first guess at where a food belongs; anything not obviously breakfast or a snack goes to
// lunch or dinner: a meat or fish main to whichever has fewer mains, the rest to whichever
// has fewer calories so far.
function guessMeal(k){
  const f = BY[k];
  if (f.cat === "Fruit" || f.cat === "Nuts & seeds") return 3;
  if (f.cat === "Eggs" || f.cat === "Dairy alternatives"
      || ((f.cat === "Dairy" || f.cat === "Grains & starches") && BREAKFASTY.test(f.name))) return 0;
  return null;
}
// The same food can sit in several meals (oats at breakfast and again at lunch), so meals[k] is a
// split: meal index -> grams. plan[k] stays the day's total for that food, which is all the
// coverage panel, suggestions and solver need. Older data stored one meal index per food.
const MEAL_IDS = ["0", "1", "2", "3"];
// splits for every food in p: keep m's split (an old single index counts as the whole amount),
// scaled to p's total if they disagree; guess a meal for the rest
function fillMeals(p, m){
  const out = {}, kc = [0, 0, 0, 0], mains = [0, 0, 0, 0];
  const put = (k, i, g) => { (out[k] = out[k] || {})[i] = (out[k][i] || 0) + g;
    kc[i] += kcalOf(k, g); if (isMain(k)) mains[i]++; };
  for (const k in p){
    const v = m && m[k];
    if (Number.isInteger(v) && MEALS[v]){ put(k, v, p[k]); continue; }
    if (!v || typeof v !== "object") continue;
    const parts = MEAL_IDS.filter(i => +v[i] > 0), sum = parts.reduce((a, i) => a + +v[i], 0);
    parts.forEach(i => put(k, +i, +v[i] * p[k] / sum));
  }
  // mains first, so the calorie balance afterwards works around them
  const rest = Object.keys(p).filter(k => !(k in out)).sort((a, b) => isMain(b) - isMain(a));
  for (const k of rest){
    let i = guessMeal(k);
    if (i === null) i = isMain(k) && mains[1] !== mains[2] ? (mains[1] < mains[2] ? 1 : 2)
                      : kc[1] <= kc[2] ? 1 : 2;
    put(k, i, p[k]);
  }
  // keep the plan's own order for display: rebuild out in p's key order
  const ordered = {}; for (const k in p) ordered[k] = out[k];
  return ordered;
}
// Set one meal's portion of a food (0 removes it) and keep plan[k] equal to the sum.
function setPortion(k, i, g){
  meals = fillMeals(plan, meals);
  const s = Object.assign({}, meals[k]);
  if (g >= 0.5) s[i] = g; else delete s[i];
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  if (total >= 0.5){ plan[k] = total; meals[k] = s; } else { delete plan[k]; delete meals[k]; }
}
// Foods in meal i, in display order. Rows are ordered by rowOrder ("food@meal" tokens), not by
// plan's key order: with oats at breakfast and lunch, plan has one place for oats, so lunch could
// never put anything above it. Rows rowOrder doesn't list yet (new ones) follow, in plan order.
function mealRows(i){
  const pos = new Map(rowOrder.map((x, n) => [x, n])), keys = Object.keys(plan);
  const at = k => pos.has(k + "@" + i) ? pos.get(k + "@" + i) : rowOrder.length + keys.indexOf(k);
  return keys.filter(k => meals[k] && meals[k][i] > 0).sort((a, b) => at(a) - at(b));
}
// The list is a token sequence: "#i" opens meal i, then one "food@meal" token per row. Drag and
// arrow keys both edit this sequence, then it is written back to meals, rowOrder and plan order in
// one place. A row moved into a meal that already has that food merges into it.
function mealTokens(){
  meals = fillMeals(plan, meals);
  const t = [];
  MEALS.forEach((_, i) => { t.push("#" + i); mealRows(i).forEach(k => t.push(k + "@" + i)); });
  return t;
}
function applyTokens(t){
  const old = fillMeals(plan, meals), next = {}, keys = [], order = [];
  let cur = 0;
  t.forEach(x => {
    if (x[0] === "#"){ cur = +x.slice(1); return; }
    const [k, from] = x.split("@"), g = old[k] && old[k][from];
    if (!(g > 0)) return;
    if (!next[k]){ next[k] = {}; keys.push(k); }
    if (!next[k][cur]) order.push(k + "@" + cur);
    next[k][cur] = (next[k][cur] || 0) + g;
  });
  meals = Object.assign(old, next);
  rowOrder = order;
  setOrder(keys);
}
// rowOrder from outside (storage, saved day, link, backup): a short list of well-formed tokens
const cleanOrder = o => Array.isArray(o)
  ? [...new Set(o.filter(x => typeof x === "string" && /^[A-Za-z0-9_-]{1,40}@[0-3]$/.test(x)).slice(0, 400)
      .map(x => { const [k, i] = x.split("@"); return renamed(k) + "@" + i; }))] : [];
function mealHeader(i, kcal, empty){
  return `<div class="mealhd" data-meal="${i}"><span>${MEALS[i]}</span>
    <span class="mk">${empty ? "" : Math.round(kcal) + " kcal"}</span></div>`
    + (empty ? `<div class="mealempty">Nothing yet</div>` : "");
}

function renderPlan(){
  meals = fillMeals(plan, meals);
  const keys = Object.keys(plan);
  const box = document.getElementById("planlist");
  if (!keys.length){
    box.innerHTML = `<p class="empty">Nothing added yet. Search above, or let
      <b>Auto-solve</b> build a complete day for you.</p>`;
  } else {
    box.innerHTML = MEALS.map((_, i) => {
      const mk = mealRows(i);
      return mealHeader(i, mk.reduce((a, k) => a + kcalOf(k, meals[k][i]), 0), !mk.length) + mk.map(k => {
      const f = BY[k], g = meals[k][i];
      const servs = +(g / f.serv).toFixed(2);   // up to 2 decimals, trailing zeros dropped
      return `<div class="prow" data-k="${k}" data-m="${i}">
        <button class="grip" data-grip="${k}@${i}" title="Drag to reorder"
          aria-label="Move ${f.name}, now in ${MEALS[i]}. Use the up and down arrow keys to move it.">${GRIP}</button>
        <span><span class="pname">${f.name}</span>${novaTag(f)}
          <span class="pmeta">1 serving = ${f.sl} (${+f.serv.toFixed(1)} g) · ${Math.round(g)} g ·
            ${Math.round(f.n[IDX.kcal]*g/100)} kcal</span></span>
        <span style="display:flex;align-items:center;gap:7px">
          <span class="amt">
            <button data-step="-1" title="One less serving (${f.serv} g)"
              aria-label="Remove one serving of ${f.name} at ${MEALS[i]}, ${f.serv} grams">&minus;</button>
            <span class="amtfield"><input type="number" data-sv value="${servs}" inputmode="decimal"
              min="0" max="50" step="0.25" aria-label="Servings of ${f.name} at ${MEALS[i]} (one serving is ${f.sl})"><span class="u">srv</span></span>
            <button data-step="1" title="One more serving (${f.serv} g)"
              aria-label="Add one serving of ${f.name} at ${MEALS[i]}, ${f.serv} grams">+</button>
          </span>
          <button class="del" data-del aria-label="Remove ${f.name} from ${MEALS[i]}">&times;</button>
        </span></div>`;
      }).join("");
    }).join("");
  }
  // pin the order just shown: new rows keep their place, removed rows don't linger
  rowOrder = MEALS.flatMap((_, i) => mealRows(i).map(k => k + "@" + i));
  renderCoverage();
  renderRecent();
  persistLocal();
}

/* ---------------- search ---------------- */
const search = document.getElementById("search"), results = document.getElementById("results");
const searchCat = document.getElementById("searchcat"), searchUnc = document.getElementById("searchunc");
let cursor = -1, hits = [];
// Lower is better. With 1,600+ foods a word like "chicken" matches dozens of forms, so: names that
// start with the query, your own foods, everyday foods, less processed (NOVA 1 before 3), cooked
// before raw meat or fish weights and dry grains or beans, then shorter (more generic) names.
function searchRank(f, words){
  const n = f.name.toLowerCase(), w0 = words[0];
  let r = n.length / 100;
  if (!words.every(w => n.includes(w))) r += 100;                       // matched only by category or tag
  if (!n.startsWith(w0)) r += new RegExp("[\\s(,-]" + w0.replace(/[^a-z0-9]/g, "")).test(n) ? 6 : 20;
  // the query names the food itself ("Brown rice", "Ground beef", "Salmon, cooked"), not a dish made
  // from it ("Rice noodles"): the last word before the first comma
  const head = n.split(",")[0].trim().split(/\s+/).pop();
  if (words.some(w => head === w || head === w + "s" || head + "s" === w)) r -= 7;
  if (f.custom) r -= 5;
  if (f.common === 0) r += 8;
  r += ((f.nova || 1) - 1) * 2;
  if (/\braw\b/.test(n) && (f.cat === "Meat & poultry" || f.cat === "Seafood")) r += 6;
  if (/\bdry\b/.test(n) && (f.cat === "Grains & starches" || f.cat === "Legumes & soy")) r += 4;
  if (/\bcanned\b/.test(n) && !words.includes("canned")) r += 4;
  return r;
}
function runSearch(){
  const q = search.value.trim().toLowerCase();
  if (!q){ results.hidden = true; search.setAttribute("aria-expanded","false"); return; }
  const words = q.split(/\s+/), cat = searchCat.value;
  const all = FOODS.filter(f => (!cat || f.cat === cat) && words.every(w => f.name.toLowerCase().includes(w)
    || f.cat.toLowerCase().includes(w) || (w.length >= 4 && (f.tags || "").includes(w))));
  // uncommon foods (game, organ meats, specialty items) only on request, or when nothing else matches
  const everyday = all.filter(f => f.common !== 0);
  const pool = searchUnc.checked || !everyday.length ? all : everyday, hidden = all.length - pool.length;
  hits = pool.map(f => [searchRank(f, words), f]).sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, 40);
  cursor = hits.length ? 0 : -1;
  results.innerHTML = hits.length
    ? hits.map((f,i) => `<button class="res${i === 0 ? " cursor" : ""}" data-add="${f.k}"
        role="option" aria-selected="${i === 0}" id="res-${i}"><span>${f.name}${novaTag(f)}</span>
        <small>${f.cat} &middot; ${f.sl}</small></button>`).join("")
      + (hidden ? `<p class="reshint">${hidden} uncommon match${hidden === 1 ? "" : "es"} hidden &mdash; tick
          &ldquo;Include uncommon foods&rdquo; to see ${hidden === 1 ? "it" : "them"}.</p>` : "")
    : `<p class="empty">No food matches &ldquo;${esc(q)}&rdquo;${cat ? ` in ${esc(cat)}` : ""}.</p>`;
  results.hidden = false;
  search.setAttribute("aria-expanded","true");
  syncCursor();
}
function syncCursor(){
  [...results.querySelectorAll(".res")].forEach((c, i) => {
    c.classList.toggle("cursor", i === cursor);
    c.setAttribute("aria-selected", String(i === cursor));
  });
  if (cursor >= 0) search.setAttribute("aria-activedescendant", "res-" + cursor);
  else search.removeAttribute("aria-activedescendant");
}
// Adds to the meal picked next to search: a new row there, or more of the row already there.
// Every way of adding a food comes through here, so it also keeps the recent-foods list.
function addFood(k, grams){
  meals = fillMeals(plan, meals);
  const have = (meals[k] && meals[k][addMeal]) || 0;
  setPortion(k, addMeal, have + (grams != null ? grams : BY[k].serv));
  recent = [k, ...recent.filter(x => x !== k)].slice(0, RECENT_MAX);
  renderPlan();
}
// Recent foods: one tap to add again, since most days reuse the same foods. Stored with the day
// (persistLocal); entries from outside go through cleanRecent like any other food key.
const RECENT_MAX = 10;
let recent = [];
const cleanRecent = r => Array.isArray(r)
  ? [...new Set(r.filter(k => typeof k === "string").map(renamed))]
      .filter(k => Object.prototype.hasOwnProperty.call(BY, k)).slice(0, RECENT_MAX) : [];
function renderRecent(){
  const box = document.getElementById("recent"), ks = cleanRecent(recent);
  box.hidden = !ks.length;
  box.innerHTML = `<span class="k">Recent</span>` + ks.map(k =>
    `<button class="chip" data-recent="${k}" title="${BY[k].name}"
       aria-label="Add one serving of ${BY[k].name} to ${MEALS[addMeal].toLowerCase()}">${BY[k].name}</button>`).join("");
}
document.getElementById("recent").addEventListener("click", e => {
  const b = e.target.closest("[data-recent]"); if (b) addFood(b.dataset.recent);
});
search.addEventListener("input", runSearch);
for (const c of [searchCat, searchUnc]) c.addEventListener("change", () => { if (search.value.trim()) runSearch(); });
search.addEventListener("keydown", e => {
  if (results.hidden || !hits.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
    syncCursor();
    const el = document.getElementById("res-" + cursor);
    if (el) el.scrollIntoView({block: "nearest"});
  } else if (e.key === "Enter"){
    // no arrow key needed - Enter takes the highlighted hit, or the first one
    e.preventDefault();
    const pick = hits[cursor >= 0 ? cursor : 0];
    if (pick){ addFood(pick.k); search.value = ""; results.hidden = true; hits = []; cursor = -1; }
  } else if (e.key === "Escape"){ results.hidden = true; }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".searchbar")) results.hidden = true;
});
results.addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  addFood(b.dataset.add); search.value = ""; results.hidden = true; search.focus();
});

/* ---------------- plan interactions ---------------- */
// Each row is one meal's portion of a food; its .prow carries data-k (food) and data-m (meal).
const rowOf = el => { const r = el.closest(".prow"); return r && {k: r.dataset.k, m: +r.dataset.m}; };
document.getElementById("planlist").addEventListener("click", e => {
  const s = e.target.closest("[data-step]"), d = e.target.closest("[data-del]");
  const r = (s || d) && rowOf(s || d); if (!r) return;
  const now = meals[r.k][r.m] || 0;
  setPortion(r.k, r.m, d ? 0 : Math.max(0, now + (+s.dataset.step) * BY[r.k].serv));
  renderPlan();
});
const planBox = document.getElementById("planlist");
planBox.addEventListener("keydown", e => {
  const g = e.target.closest("[data-grip]"); if (!g) return;
  if (!["ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
  e.preventDefault();
  // moving past a meal header moves the food into that meal; index 0 is the first header
  const t = mealTokens(), i = t.indexOf(g.dataset.grip);
  const j = e.key === "Home" ? 1 : e.key === "End" ? t.length - 1
          : i + (e.key === "ArrowUp" ? -1 : 1);
  if (j < 1 || j >= t.length || j === i) return;
  t.splice(j, 0, t.splice(i, 1)[0]);
  // the row now belongs to the meal of the nearest header above it
  const dest = t.slice(0, j).reverse().find(x => x[0] === "#").slice(1);
  applyTokens(t); renderPlan();
  const again = planBox.querySelector(`[data-grip="${g.dataset.grip.split("@")[0]}@${dest}"]`);
  if (again) again.focus();
});
let drag = null;
planBox.addEventListener("pointerdown", e => {
  const g = e.target.closest("[data-grip]"); if (!g || e.button > 0) return;
  e.preventDefault();
  // a touch is captured by the handle automatically; release it, since the row (and the handle
  // with it) moves in the DOM as it is dragged, and the document listeners below do the tracking
  if (g.hasPointerCapture && g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
  const row = g.closest(".prow");
  // Listen on the document rather than capturing the pointer: moving the row in the DOM
  // would drop a capture and end the drag after the first step.
  drag = {row, k: g.dataset.grip, startY: e.clientY, moved: false, id: e.pointerId};
  row.classList.add("dragging");
  document.body.classList.add("reordering");
});
document.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const y = e.clientY;
  if (Math.abs(y - drag.startY) > 3) drag.moved = true;
  // shift the row under the pointer, comparing against the midpoints of the other rows and the
  // meal headers; starting at 1 keeps every food below the first header
  const kids = [...planBox.children].filter(r => r !== drag.row);
  let before = null;
  for (let i = 1; i < kids.length; i++){ const b = kids[i].getBoundingClientRect();
    if (y < b.top + b.height / 2){ before = kids[i]; break; } }
  if (before !== drag.row.nextElementSibling) planBox.insertBefore(drag.row, before);
  // keep the list in view while dragging near the window edges
  if (y < 40) window.scrollBy(0, -12); else if (y > innerHeight - 40) window.scrollBy(0, 12);
});
function endDrag(){
  if (!drag) return;
  const t = [...planBox.querySelectorAll(".mealhd,.prow")]
    .map(r => r.dataset.k ? r.dataset.k + "@" + r.dataset.m : "#" + r.dataset.meal);
  drag.row.classList.remove("dragging");
  document.body.classList.remove("reordering");
  const changed = t.join() !== mealTokens().join();
  drag = null;
  if (changed){ applyTokens(t); renderPlan(); }
}
document.addEventListener("pointerup", e => { if (drag && e.pointerId === drag.id) endDrag(); });
document.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) endDrag(); });
document.getElementById("planlist").addEventListener("change", e => {
  const i = e.target.closest("[data-sv]"); if (!i) return;
  const r = rowOf(i);
  const sv = Math.max(0, Math.min(50, parseFloat(String(i.value).replace(",", ".")) || 0));
  setPortion(r.k, r.m, sv * BY[r.k].serv);   // grams stay the stored unit
  renderPlan();
});
document.getElementById("coverage").addEventListener("click", e => {
  const a = e.target.closest("[data-addsrc]");
  if (a){ addFood(a.dataset.addsrc); return; }
  const b = e.target.closest(".info"); if (!b) return;
  const n = b.dataset.note;
  if (openNotes.has(n)) openNotes.delete(n); else openNotes.add(n);
  renderCoverage();
  const again = document.querySelector(`#coverage [data-note="${n}"]`);
  if (again) again.focus();
});
document.getElementById("btn-gapsfirst").addEventListener("click", e => {
  gapsFirst = !gapsFirst;
  e.currentTarget.setAttribute("aria-pressed", String(gapsFirst));
  renderCoverage();
});
document.getElementById("btn-clear").addEventListener("click", () => { plan = {}; noteRemoved({}); renderPlan(); });

