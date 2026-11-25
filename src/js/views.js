/* ---------------- browse ---------------- */
const brNut = document.getElementById("br-nut"), brCat = document.getElementById("br-cat");
const RANKABLE = ORDER.filter(n => n !== "kcal");
brNut.innerHTML = RANKABLE.map(n => `<option value="${n}">${META[n].label}</option>`).join("");
brNut.value = "K";
document.getElementById("br-diet").innerHTML =
  Object.keys(DIETS).map(k => `<option value="${k}">${DIETS[k].label}</option>`).join("");
// the ranking table's and the search box's category lists (your own foods add "My foods")
function fillCats(){
  for (const sel of [brCat, document.getElementById("searchcat")]){
    const was = sel.value;
    sel.innerHTML = `<option value="">All categories</option>` +
      [...new Set(FOODS.map(f => f.cat))].sort().map(c => `<option>${c}</option>`).join("");
    sel.value = [...sel.options].some(o => o.value === was) ? was : "";
  }
}
fillCats();
function renderBrowse(){
  const n = brNut.value, basis = document.getElementById("br-basis").value;
  const cat = brCat.value, diet = document.getElementById("br-diet").value;
  const allowed = new Set(pool(diet, "balanced", avoid)), t = targets();
  const rows = FOODS.filter(f => allowed.has(f.k) && (!cat || f.cat === cat)).map(f => {
    const per100 = f.n[IDX[n]];
    const kc = f.n[IDX.kcal];
    const v = basis === "serv" ? per100 * f.serv / 100
            : basis === "100g" ? per100
            : kc ? per100 * 100 / kc : 0;
    const amtKcal = basis === "serv" ? kc * f.serv / 100 : basis === "100g" ? kc : 100;
    return {f, v, amtKcal, pct: t[n] ? 100 * v / t[n] : 0};
  }).sort((a, b) => b.v - a.v).slice(0, 40);
  const unit = unitOf(n);
  const basisLabel = basis === "serv" ? "per serving" : basis === "100g" ? "per 100 g" : "per 100 kcal";
  document.querySelector("#brtable thead").innerHTML = `<tr>
    <th>Food</th><th class="cat" style="text-align:left">Category</th>
    <th>Serving</th><th>${META[n].label} ${basisLabel} (${unit})</th>
    <th>% of your target</th><th>kcal</th><th></th></tr>`;
  document.querySelector("#brtable tbody").innerHTML = rows.map(r => `<tr>
    <td>${r.f.name}${novaTag(r.f)}</td><td class="cat">${r.f.cat}</td>
    <td>${r.f.sl}</td>
    <td>${r.v >= 100 ? Math.round(r.v) : r.v >= 1 ? r.v.toFixed(1) : r.v.toFixed(2)}</td>
    <td style="color:${r.pct>=50?"var(--pine)":"inherit"};font-weight:${r.pct>=50?600:400}">${
      r.pct >= 1 ? Math.round(r.pct) + "%" : r.pct > 0 ? "<1%" : "—"}</td>
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

