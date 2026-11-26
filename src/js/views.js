/* ---------------- browse ---------------- */
const brNut = document.getElementById("br-nut"), brCat = document.getElementById("br-cat");
const RANKABLE = ORDER.filter(n => n !== "kcal");
brNut.innerHTML = `<option value="density">Overall nutrient density</option>` +
  RANKABLE.map(n => `<option value="${n}">${META[n].label}</option>`).join("");
brNut.value = "density";
// Overall nutrient density of `grams` of a food: the average share of your counted targets it
// supplies, each capped at 100% so one huge value (liver's vitamin A) can't carry the score.
// Returns the score and the nutrients it supplies most of.
function densityOf(f, grams, t){
  const pct = COUNTED.filter(n => t[n]).map(n => [n, Math.min(100, 100 * f.n[IDX[n]] * grams / 100 / t[n])]);
  return {score: pct.reduce((a, [, p]) => a + p, 0) / pct.length,
          top: pct.filter(([, p]) => p >= 10).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => META[n].label)};
}
// "Per 100 calories" means kilograms of black coffee or tea; foods under this aren't ranked on it
const MIN_KCAL_PER_100G = 10;
document.getElementById("br-diet").innerHTML =
  Object.keys(DIETS).map(k => `<option value="${k}">${DIETS[k].label}</option>`).join("");
// the ranking table's category list (your own foods add "My foods")
function fillCats(){
  const was = brCat.value;
  brCat.innerHTML = `<option value="">All categories</option>` +
    [...new Set(FOODS.map(f => f.cat))].sort().map(c => `<option>${c}</option>`).join("");
  brCat.value = [...brCat.options].some(o => o.value === was) ? was : "";
}
fillCats();
function renderBrowse(){
  const n = brNut.value, basis = document.getElementById("br-basis").value;
  const cat = brCat.value, diet = document.getElementById("br-diet").value;
  const allowed = new Set(pool(diet, "balanced", avoid)), t = targets(), dens = n === "density";
  const rows = FOODS.filter(f => allowed.has(f.k) && (!cat || f.cat === cat)
      && (basis !== "kcal" || f.n[IDX.kcal] >= MIN_KCAL_PER_100G)).map(f => {
    const kc = f.n[IDX.kcal];
    const grams = basis === "serv" ? f.serv : basis === "100g" ? 100 : 100 * 100 / kc;
    const amtKcal = kc * grams / 100;
    if (dens){ const d = densityOf(f, grams, t); return {f, v: d.score, amtKcal, top: d.top}; }
    const v = f.n[IDX[n]] * grams / 100;
    return {f, v, amtKcal, pct: t[n] ? 100 * v / t[n] : 0};
  }).sort((a, b) => b.v - a.v).slice(0, 40);
  const basisLabel = basis === "serv" ? "per serving" : basis === "100g" ? "per 100 g" : "per 100 kcal";
  document.getElementById("br-note").textContent = dens
    ? `The average share of your ${COUNTED.length} nutrient targets that this amount supplies, each capped at 100% so no single `
      + `nutrient carries the score. Per 100 calories favors low-calorie foods like leafy greens; per serving shows what a normal portion delivers.`
    : "";
  document.querySelector("#brtable thead").innerHTML = `<tr>
    <th>Food</th><th class="cat" style="text-align:left">Category</th>
    <th>Serving</th>${dens
      ? `<th>Nutrient density ${basisLabel}</th><th style="text-align:left">Best for</th>`
      : `<th>${META[n].label} ${basisLabel} (${unitOf(n)})</th><th>% of your target</th>`}<th>kcal</th><th></th></tr>`;
  document.querySelector("#brtable tbody").innerHTML = rows.map(r => `<tr>
    <td>${r.f.name}${novaTag(r.f)}</td><td class="cat">${r.f.cat}</td>
    <td>${r.f.sl}</td>${dens
      ? `<td>${Math.round(r.v)}%</td><td style="text-align:left">${r.top.join(", ") || "&mdash;"}</td>`
      : `<td>${r.v >= 100 ? Math.round(r.v) : r.v >= 1 ? r.v.toFixed(1) : r.v.toFixed(2)}</td>
    <td style="color:${r.pct>=50?"var(--pine)":"inherit"};font-weight:${r.pct>=50?600:400}">${
      r.pct >= 1 ? Math.round(r.pct) + "%" : r.pct > 0 ? "<1%" : "—"}</td>`}
    <td>${Math.round(r.amtKcal)}</td>
    <td class="addcell"><button data-add="${r.f.k}">Add</button></td></tr>`).join("");
}
["br-nut","br-basis","br-cat","br-diet"].forEach(id =>
  document.getElementById(id).addEventListener("change", renderBrowse));
document.querySelector("#brtable").addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  addFood(b.dataset.add);
  b.textContent = "Added"; setTimeout(() => { b.textContent = "Add"; }, 1100);
});

/* ---------------- tabs ---------------- */
function showTab(which){
  ["build","solve","browse"].forEach(t => {
    document.getElementById("tab-" + t).setAttribute("aria-selected", String(t === which));
    document.getElementById("p-" + t).hidden = t !== which;
  });
  if (which === "solve"){ renderScarcity(); poolNote(); }
  if (which === "browse") renderBrowse();
}
["build","solve","browse"].forEach(t =>
  document.getElementById("tab-" + t).addEventListener("click", () => showTab(t)));

/* ---------------- profile ---------------- */
["sex","age","kcal"].forEach(id => document.getElementById(id).addEventListener("change", () => {
  profile = {sex: document.getElementById("sex").value,
             age: +document.getElementById("age").value,
             kcal: Math.max(1200, Math.min(5000, +document.getElementById("kcal").value || 2500))};
  SCARCE = scarcityFor(ALLKEYS);
  renderCoverage(); persistLocal();
  if (!document.getElementById("p-solve").hidden) renderScarcity();
  if (!document.getElementById("p-browse").hidden) renderBrowse();
}));

