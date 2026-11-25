/* ---------------- suggestions ---------------- */
function deficits(p, tg){
  const tot = totals(p); tg = tg || targets();
  const out = {};
  COUNTED.forEach(n => { if (tg[n] && tot[IDX[n]] < tg[n]) out[n] = tg[n] - tot[IDX[n]]; });
  return out;
}
const UNCOMMON_WEIGHT = 0.5;   // foods.json `common: 0`; tuned on the 288-day sweep
function suggest(p, poolKeys, sc, ul, tg){
  sc = sc || SCARCE;
  tg = tg || targets(); ul = ul || limits();
  const def = deficits(p, tg), tot = totals(p);
  const names = Object.keys(def);
  if (!names.length) return [];
  const load = ulLoad(p, ul);
  return (poolKeys || FOODS.map(f => f.k))
    .filter(k => !p[k] && !sugOff.has(groupOf(k))).map(k => {
    const f = BY[k], g = f.serv / 100;
    let score = 0; const fixes = [];
    names.forEach(n => {
      const add = f.n[IDX[n]] * g; if (add <= 0) return;
      const frac = Math.min(add, def[n]) / tg[n];
      const severity = 1 + 2.5 * (def[n] / tg[n]);   // far-from-target outranks nearly-there
      score += frac * (0.3 + sc[n] * 6) * severity;
      if (add >= def[n] * 0.5) fixes.push(META[n].label);
    });
    // Under a carb cap, a food that eats much of what's left of the budget crowds out every
    // later choice (keto days used to spend all 30 g on soybeans and edamame first)
    if (ul.netcarb) score *= Math.max(0.05, 1 - netCarbOf(f, f.serv) / Math.max(1, ul.netcarb - load.netcarb));
    // A softer version for every upper limit: a heavily fortified cereal (33 mg iron per 100 g)
    // left no iron room for the calorie top-up, so vegan and vegetarian days stalled near 60%
    // kcal. The 1.5 power spares foods using a small share of the room (a linear discount cost
    // 7-food days their dense picks); chosen by the 288-day sweep in tests/smoke.js.
    // A limit the day is already over can't rule foods out (nearly every food has some sodium, so
    // the panel went empty): rank by how little a serving adds, as a share of the limit.
    for (const n in ul) if (n !== "netcarb")
      score *= load[n] > ul[n]
        ? Math.max(0.05, 1 - ulAmount(f, n, f.serv) / (0.1 * ul[n]))
        : Math.max(0.1, 1 - (ulAmount(f, n, f.serv) / Math.max(1e-9, ul[n] - load[n])) ** 1.5);
    // Prefer foods people actually buy: an uncommon one (beef spleen, starfruit, wheat germ oil)
    // only wins when it closes much more of the gap. Your own foods count as everyday.
    if (f.common === 0) score *= UNCOMMON_WEIGHT;
    // disqualify anything that would push a limit over (one the day is already over is ranked above)
    for (const n in ul) if (load[n] <= ul[n] && load[n] + ulAmount(f, n, f.serv) > ul[n]) score = -1;
    return {k, score, fixes: fixes.slice(0, 4), kcal: Math.round(f.n[IDX.kcal] * g)};
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
}
document.getElementById("sugchips").innerHTML = GROUPS.map(g =>
  `<button class="chip" data-sugoff="${g}" aria-pressed="false">${g}</button>`).join("");
document.getElementById("sugchips").addEventListener("click", e => {
  const c = e.target.closest("[data-sugoff]"); if (!c) return;
  const g = c.dataset.sugoff;
  if (sugOff.has(g)) sugOff.delete(g); else sugOff.add(g);
  c.setAttribute("aria-pressed", String(sugOff.has(g)));
  persistLocal(); renderSuggestions();
});
function renderSuggestions(){
  const card = document.getElementById("sugcard");
  const list = suggest(plan, pool(document.getElementById("sv-diet").value, "balanced", avoid));
  const ul = limits(), load = ulLoad(plan, ul);
  const over = Object.keys(ul).filter(n => load[n] > ul[n]).map(n => META[n].label);
  card.hidden = false;
  document.getElementById("suglist").innerHTML = (over.length
    ? `<p class="rowhint" style="margin-bottom:12px">Your day is over the upper limit for ${over.join(", ")}.
        These suggestions add as little of it as possible.</p>` : "") + (list.length
    ? list.map(s => `<div class="sug">
        <span><span class="sugname">${BY[s.k].name}</span>
          <span class="sugwhy">1 &times; ${BY[s.k].sl} &middot; ${s.kcal} kcal</span>
          <span class="tagrow">${s.fixes.map(x => `<span class="tg">${x}</span>`).join("")}</span></span>
        <button class="btn ghost" data-add="${s.k}">Add</button></div>`).join("")
    : (Object.keys(deficits(plan)).length
        ? `<p class="empty">No food left to suggest &mdash; everything that would help is
             switched off above, or excluded by your diet rules.</p>`
        : `<p class="empty">Nothing left to fix &mdash; every target is met.</p>`));
}
document.getElementById("btn-suggest").addEventListener("click", () => {
  renderSuggestions();
  document.getElementById("sugcard").scrollIntoView({behavior:"smooth", block:"nearest"});
});
document.getElementById("suglist").addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  addFood(b.dataset.add);
  renderSuggestions();
});

/* ---------------- solver ---------------- */
function pool(diet, style, av){
  const d = DIETS[diet] || DIETS.anything;
  av = av || avoid;
  let ks = FOODS.filter(f => d.cls.includes(f.cls)).map(f => f.k);
  if (d.no)      ks = ks.filter(k => !tagsOf(k).some(t => d.no.includes(t)));
  if (d.rawOnly) ks = ks.filter(k => BY[k].raw);
  // your own foods carry no grain/legume/sugar/red-meat tags, so rule-based patterns skip them
  if (d.no) ks = ks.filter(k => !BY[k].custom);
  if (av && av.size) ks = ks.filter(k => !tagsOf(k).some(t => av.has(t)));
  if (style === "ordinary") ks = ks.filter(k => ORDINARY.has(k));
  return ks;
}
// A net-carb ceiling behaves exactly like an upper limit, so it rides the same machinery.
function dietCaps(diet){
  const d = DIETS[diet] || DIETS.anything;
  return d.netCarbMax ? {netcarb: d.netCarbMax} : {};
}
function dietTargets(diet){
  const d = DIETS[diet] || DIETS.anything, t = targets();
  if (d.proteinPct) t.protein = Math.max(t.protein, d.proteinPct / 100 * t.kcal / 4);
  return t;
}
function capOf(k){ return BY[k].serv * (MAXSERV[k] || CAT_MAXSERV[BY[k].cat] || DEFAULT_MAXSERV); }

function solveDay(opts){
  const {diet, maxFoods, style, seed} = opts;
  const ks = pool(diet, style, opts.avoid), tg = dietTargets(diet),
        ul = Object.assign({}, limits(), dietCaps(diet));
  const sc = scarcityFor(ks);
  let p = Object.assign({}, seed || {});
  // Alternate: add the food that best closes the remaining gap, then re-tune portions,
  // then look again. Tuning between picks stops the solver from adding a food for a gap
  // that a portion increase would already have closed.
  for (let round = 0; round < maxFoods + 2; round++){
    if (!Object.keys(deficits(p, tg)).length) break;
    if (countFoods(p) < maxFoods){
      const s = suggest(p, mainsFull(p, diet) ? ks.filter(k => !isMain(k)) : ks, sc, ul, tg);
      if (!s.length){ tune(p, tg, ul, sc); break; }
      let pick = s[0];
      if (style === "light"){
        pick = s.slice(0, 4).sort((a, b) =>
          b.score / BY[b.k].serv - a.score / BY[a.k].serv)[0];
      } else if (style === "fewest"){
        pick = s.slice(0, 3).sort((a, b) => b.fixes.length - a.fixes.length)[0];
      }
      p[pick.k] = BY[pick.k].serv;
    }
    tune(p, tg, ul, sc);
    if (countFoods(p) >= maxFoods) break;
  }
  tune(p, tg, ul, sc);
  trimKcal(p, tg);
  swapLeaner(p, tg, ul, ks, sc, diet, new Set(Object.keys(seed || {})));
  topUp(p, tg, ul, ks, maxFoods, diet);
  roundPortions(p, ul);
  return p;
}

// Once nutrients are covered, bring calories up to the target (aiming 1% over, so rounding
// portions to 5 g can't drop it back under). Grow the food that has been scaled up least
// relative to its serving cap, so extra energy is spread across the day instead of piling
// into one food; if nothing can grow and there is room, add an ordinary staple.
// This is the last step, so no later food needs UL_HEADROOM; keep only a sliver of margin for
// the 5 g rounding that follows.
const KCAL_AIM = 1.01, KCAL_MAX = 1.04, TOPUP_UL = 0.97;
function topUp(p, tg, ul, ks, maxFoods, diet){
  const fits = (k, g) => { const load = ulLoad(p, ul);
    for (const n in ul) if (load[n] + ulAmount(BY[k], n, g) > ul[n] * TOPUP_UL) return false;
    return true; };
  // grams of k that close the gap, at most half a serving, in 5 g steps
  const stepFor = (k, gap) => { const f = BY[k], kc = f.n[IDX.kcal];
    return Math.min(Math.max(5, f.serv / 2), Math.ceil(gap / (kc / 100) / 5) * 5); };
  const trimmed = new Set();   // foods cut back to make room under a limit; never grown again
  let fatsAdded = 0;
  for (let it = 0; it < 300; it++){
    const kc = totals(p)[IDX.kcal], gap = tg.kcal * KCAL_AIM - kc;
    if (gap <= 0) return;
    let best = null, bestR = Infinity;
    Object.keys(p).forEach(k => {
      const f = BY[k], kc100 = f.n[IDX.kcal];
      if (SEASONING.has(k) || trimmed.has(k) || kc100 < 20) return;   // salt and near-zero foods can't carry energy
      const g = stepFor(k, gap);
      if (p[k] + g > capOf(k) || kc + kc100 * g / 100 > tg.kcal * KCAL_MAX || !fits(k, g)) return;
      const r = p[k] / capOf(k);
      if (r < bestR){ bestR = r; best = k; }
    });
    const room = countFoods(p) < maxFoods;
    if (!best && room){
      // shortcut: picks the most energy-dense ordinary food in the pool; upgrade to a
      // nutrient-aware choice if top-ups start looking odd
      const staples = ks.filter(k => !(k in p) && BY[k].n[IDX.kcal] >= 60 && !MAXSERV[k]
        && ORDINARY.has(k) && !(isMain(k) && mainsFull(p, diet)))
        .sort((a, b) => BY[b].n[IDX.kcal] * BY[b].serv - BY[a].n[IDX.kcal] * BY[a].serv);
      const add = staples.find(k => fits(k, stepFor(k, gap)));
      if (add){ p[add] = stepFor(add, gap); continue; }
    }
    if (best){ p[best] += stepFor(best, gap); continue; }
    if (makeRoom(p, tg, ul, trimmed)) continue;
    // Last resort, when no staple fits even after making room (keto's carb ceiling is the usual
    // reason): a cooking fat, energy with no carbohydrate, capped at a few tablespoons by
    // MAXSERV. At most two (three on a carb-capped pattern, which runs on fat), so a day doesn't
    // end up with four different oils. Ordinary foods first, then olive oil, then the fats with
    // the least carbohydrate, since under a carb cap even butter's trace can be one gram too many.
    if (room && fatsAdded < ((DIETS[diet] || {}).netCarbMax ? 3 : 2)){
      const carbPerKcal = k => netCarbOf(BY[k], 100) / BY[k].n[IDX.kcal];
      const fat = ks.filter(k => !(k in p) && BY[k].n[IDX.kcal] > 0
          && 9 * BY[k].n[IDX.fat] / BY[k].n[IDX.kcal] > 0.8)
        .sort((a, b) => ORDINARY.has(b) - ORDINARY.has(a) || (b === "oliveoil") - (a === "oliveoil")
          || carbPerKcal(a) - carbPerKcal(b))
        .find(k => fits(k, stepFor(k, gap)));
      if (fat){ p[fat] = stepFor(fat, gap); fatsAdded++; continue; }
    }
    return;
  }
}
// true if no nutrient target is further from met than it was in `before` (a deficits() result)
const noWorseThan = (p, tg, before) =>
  Object.entries(deficits(p, tg)).every(([n, d]) => n in before && d <= before[n] + 1e-9);
// The mirror of topUp: when a small food pool needs many whole servings to close the last gaps,
// calories overshoot and tune() never gets to trim them. Cut whatever portion removes the most
// energy without leaving any nutrient worse off, down to KCAL_AIM.
function trimKcal(p, tg){
  for (let it = 0; it < 300; it++){
    const excess = totals(p)[IDX.kcal] - tg.kcal * KCAL_AIM;
    if (excess <= tg.kcal * (KCAL_MAX - KCAL_AIM)) return;
    const before = deficits(p, tg);
    let best = null, bestG = 0, bestCut = 0;
    for (const k in p){
      const kc100 = BY[k].n[IDX.kcal]; if (kc100 <= 0) continue;
      // never below half a serving, the same floor tune() uses, so a food the user kept stays
      const g = Math.min(p[k] - BY[k].serv / 2, Math.max(5, BY[k].serv / 2),
                         Math.ceil(excess / (kc100 / 100) / 5) * 5);
      if (g <= 0) continue;
      const cut = kc100 * g / 100; if (cut <= bestCut) continue;
      p[k] -= g; const ok = noWorseThan(p, tg, before); p[k] += g;
      if (ok){ best = k; bestG = g; bestCut = cut; }
    }
    if (!best) return;
    p[best] -= bestG;
  }
}
// A day still over its calorie ceiling after trimKcal is calorie-bound: every portion is
// carrying some nutrient. Try dropping one food (never one the user kept) and putting in one
// of the best few replacements instead, re-tuned and re-trimmed; keep the swap that saves the
// most calories without leaving any target worse off. Only runs on these few days, since
// each pass re-solves up to ~40 variants.
// fixed sizes, not a time budget, so a given day always solves the same way (and tests can rely on it)
const SWAP_PASSES = 3, SWAP_CANDS = 3;
function swapLeaner(p, tg, ul, ks, sc, diet, keep){
  for (let pass = 0; pass < SWAP_PASSES; pass++){
    const kcal = totals(p)[IDX.kcal];
    if (kcal <= tg.kcal * KCAL_MAX) return;
    const before = deficits(p, tg);
    let best = null, bestKcal = kcal - tg.kcal * 0.02;   // a swap must save at least 2%
    const consider = r => { const kc = totals(r)[IDX.kcal];
      if (kc < bestKcal && noWorseThan(r, tg, before)){ best = r; bestKcal = kc; } };
    for (const k of Object.keys(p)){
      if (keep.has(k) || SEASONING.has(k)) continue;
      const q = Object.assign({}, p); delete q[k];
      consider(q);   // the food may only have been carrying calories
      const cands = suggest(q, mainsFull(q, diet) ? ks.filter(c => !isMain(c)) : ks, sc, ul, tg)
        .filter(s => s.k !== k).slice(0, SWAP_CANDS);
      for (const s of cands){
        const r = Object.assign({}, q); r[s.k] = BY[s.k].serv;
        tune(r, tg, ul, sc); trimKcal(r, tg);
        consider(r);
      }
    }
    if (!best) return;
    for (const k in p) delete p[k];
    Object.assign(p, best);
  }
}
// Round portions to 5 g, or 0.5 g for foods served by the gram or two (salt is 1.5 g a serving;
// a 5 g floor put 2 g of sodium in some days). A nutrient the solver filled right up to its
// limit can be tipped over by rounding up, so for any limit that ends up breached, round its
// contributors down instead.
function roundPortions(p, ul){
  const raw = Object.assign({}, p);
  const unit = k => BY[k].serv < 10 ? 0.5 : 5;
  const round = (k, how) => Math.max(unit(k), how(raw[k] / unit(k)) * unit(k));
  for (const k in p) p[k] = round(k, Math.round);
  for (const n in ul){
    const up = Object.keys(p).filter(k => p[k] > raw[k])
      .sort((a, b) => ulAmount(BY[b], n, p[b]) - ulAmount(BY[a], n, p[a]));
    for (const k of up){
      if (ulLoad(p, ul)[n] <= ul[n]) break;
      p[k] = round(k, Math.floor);
    }
  }
}
// A limit is nearly full (often iron, after the solver leaned on soybeans and greens): cut half
// a serving of its biggest contributor, as long as no nutrient target ends up worse off.
function makeRoom(p, tg, ul, trimmed){
  const load = ulLoad(p, ul), before = deficits(p, tg);
  const noWorse = () => noWorseThan(p, tg, before);
  for (const n of Object.keys(ul).filter(n => load[n] > ul[n] * 0.9)){
    const ks = Object.keys(p).sort((a, b) => ulAmount(BY[b], n, p[b]) - ulAmount(BY[a], n, p[a]));
    for (const k of ks){
      const step = Math.max(5, BY[k].serv / 2);
      if (p[k] - step < 5 || ulAmount(BY[k], n, step) <= 0) continue;
      p[k] -= step;
      if (noWorse()){ trimmed.add(k); return true; }
      p[k] += step;
    }
  }
  return false;
}

function tune(p, tg, ul, sc){
  const keys = Object.keys(p);
  for (let it = 0; it < 400; it++){
    const tot = totals(p);
    // worst-covered counted nutrient
    let worst = null, worstR = 1;
    COUNTED.forEach(n => {
      if (!tg[n]) return;
      const r = tot[IDX[n]] / tg[n];
      if (r < worstR){ worstR = r; worst = n; }
    });
    if (!worst) break;
    // best food for it that has room and won't breach a UL
    const load = ulLoad(p, ul);
    let best = null, bestV = 0;
    keys.forEach(k => {
      const f = BY[k], step = Math.max(5, f.serv / 2);
      if (p[k] + step > capOf(k)) return;
      const per = f.n[IDX[worst]] * step / 100;
      if (per <= 0) return;
      for (const n in ul) if (load[n] + ulAmount(f, n, step) > ul[n] * UL_HEADROOM) return;
      const v = per / Math.max(1, f.n[IDX.kcal] * step / 100);
      if (v > bestV){ bestV = v; best = k; }
    });
    if (!best) break;
    p[best] += Math.max(5, BY[best].serv / 2);
    // keep calories near target by trimming the least useful food
    const kc = totals(p)[IDX.kcal];
    if (kc > tg.kcal * 1.04){
      const t2 = totals(p);
      let drop = null, dropV = Infinity;
      keys.forEach(k => {
        const f = BY[k], step = Math.max(5, f.serv / 2);
        if (p[k] - step < f.serv * 0.5) return;
        let harm = 0;
        COUNTED.forEach(n => {
          if (!tg[n]) return;
          const after = t2[IDX[n]] - f.n[IDX[n]] * step / 100;
          if (after < tg[n]) harm += (tg[n] - after) / tg[n] * (0.3 + (sc||SCARCE)[n] * 6);
        });
        if (harm < dropV){ dropV = harm; drop = k; }
      });
      if (drop) p[drop] -= Math.max(5, BY[drop].serv / 2);
    }
  }
}
function evaluate(p, diet){
  const tot = totals(p), tg = dietTargets(diet || "anything");
  const ul = Object.assign({}, limits(), dietCaps(diet || "anything"));
  // calories count toward the 28 too, the same way the builder's coverage panel counts them
  const short = COUNTED.concat(["kcal"]).filter(n => tg[n] && tot[IDX[n]] < tg[n] * 0.995);
  const load = ulLoad(p, ul);
  const over = Object.keys(ul).filter(n => load[n] > ul[n] * 1.001);
  const netcarb = Object.keys(p).reduce((a, k) => a + netCarbOf(BY[k], p[k]), 0);
  return {short, over, kcal: Math.round(tot[IDX.kcal]),
    mass: Math.round(Object.values(p).reduce((a,b)=>a+b,0)),
    mn: tot[IDX.Mn], fe: tot[IDX.Fe], netcarb,
    fatPct: tot[IDX.kcal] ? 900 * tot[IDX.fat] / tot[IDX.kcal] : 0,
    proPct: tot[IDX.kcal] ? 400 * tot[IDX.protein] / tot[IDX.kcal] : 0};
}
function planCard(p, i, opts){
  const e = evaluate(p, opts && opts.diet), keys = Object.keys(p), m = fillMeals(p, {});
  const ok = !e.short.length && !e.over.length;
  const flags = [];
  if (e.mn > D.softUl.Mn) flags.push(`Manganese ${Math.round(e.mn)} mg`);
  if (e.fe > 25) flags.push(`Iron ${Math.round(e.fe)} mg`);
  return `<div class="card" style="margin-bottom:14px">
    <h3>${ok ? "Complete day" : "Best found"} &mdash; ${keys.length} foods</h3>
    <div id="sv-${i}">${MEALS.map((_, mi) => {
      const mk = keys.filter(k => m[k][mi] > 0);   // a solved day puts each food in one meal
      return mk.length ? mealHeader(mi, mk.reduce((a, k) => a + kcalOf(k, p[k]), 0), false)
        + mk.map(k => `<div class="prow"><span>
      <span class="pname">${BY[k].name}</span>${novaTag(BY[k])}
      <span class="pmeta">${p[k]} g &middot; ${(p[k]/BY[k].serv).toFixed(1)} × ${BY[k].sl}</span>
      </span><span class="mono" style="font-size:12.5px;color:var(--muted)">${
        Math.round(BY[k].n[IDX.kcal]*p[k]/100)} kcal</span></div>`).join("") : "";
    }).join("")}</div>
    <div class="sum" style="border-bottom:none;border-top:1px solid var(--rule)">
      <div class="sumcell"><span class="k">Targets met</span>
        <span class="v ${ok?"good":"bad"}">${28 - e.short.length}/28</span></div>
      <div class="sumcell"><span class="k">Calories</span><span class="v">${e.kcal}</span></div>
      <div class="sumcell"><span class="k">Weight</span><span class="v">${e.mass} g</span></div>
    </div>
    <div class="solvenote" style="padding-top:12px">Net carbs
      <b>${Math.round(e.netcarb)} g</b> &middot; ${Math.round(e.proPct)}% of calories from
      protein &middot; ${Math.round(e.fatPct)}% from fat.</div>
    ${e.over.length ? `<div class="solvenote" style="padding-top:12px">Over the limit:
      ${e.over.map(n => META[n] ? META[n].label : n).join(", ")}.</div>` : ""}
    ${e.short.length ? `<div class="solvenote" style="padding-top:12px">Still short:
      ${e.short.map(n => META[n].label).join(", ")}.${
        e.short.includes("B12") && opts.diet === "vegan"
          ? (opts.avoid && opts.avoid.has("fortified")
              ? " <b>Vitamin B12 cannot be closed on a vegan diet from unfortified food</b> \u2014 no\
 unfortified plant food contains it. Switch <b>Fortified foods</b> back on to let a fortified plant milk cover it."
              : " <b>No food in your allowed set supplies vitamin B12.</b> On a vegan diet it has to come\
 from a fortified food or a supplement.") : ""}${
        e.short.length && e.short.every(n => n === "B12")
          ? "" : " Try raising the food limit."}</div>` : ""}
    ${flags.length ? `<div class="solvenote" style="padding-top:4px">Runs high:
      ${flags.join(", ")}.</div>` : ""}
    <div class="btnrow"><button class="btn" data-load='${JSON.stringify(p)}'>Open in builder</button></div>
  </div>`;
}
function readSolveOpts(){
  return {diet: document.getElementById("sv-diet").value,
    maxFoods: +document.getElementById("sv-max").value,
    style: document.getElementById("sv-style").value,
    seed: document.getElementById("sv-keep").value === "yes" ? plan : null,
    avoid: new Set(avoid)};
}
document.getElementById("sv-diet").addEventListener("change", () => { renderScarcity(); poolNote(); });
document.getElementById("btn-solve").addEventListener("click", () => {
  const o = readSolveOpts();
  const p = solveDay(o);
  document.getElementById("solveout").innerHTML = planCard(p, 0, o);
});
document.getElementById("btn-solve5").addEventListener("click", () => {
  const o = readSolveOpts();
  const variants = [["balanced", 0], ["fewest", 0], ["light", 0], ["ordinary", 0],
                    ["balanced", 3], ["light", 3], ["balanced", -2]];
  const seen = new Set(), out = [];
  variants.forEach(([st, dMax]) => {
    if (out.length >= 5) return;
    const p = solveDay(Object.assign({}, o, {style: st,
      maxFoods: Math.max(3, o.maxFoods + dMax)}));
    const sig = Object.keys(p).sort().join("|");
    if (seen.has(sig)) return;
    seen.add(sig); out.push(p);
  });
  document.getElementById("solveout").innerHTML = out.map((p,i) => planCard(p,i,o)).join("");
});
document.getElementById("solveout").addEventListener("click", e => {
  const b = e.target.closest("[data-load]"); if (!b) return;
  plan = knownOnly(JSON.parse(b.dataset.load)); meals = {}; rowOrder = [];
  noteRemoved({}); renderPlan(); showTab("build");
  window.scrollTo({top: 0, behavior: "smooth"});
});

/* ---------------- allergen / intolerance exclusions ---------------- */
document.getElementById("avoidchips").innerHTML = AVOIDABLE.map(([t, label]) =>
  `<button class="chip" data-avoid="${t}" aria-pressed="false">${label}</button>`).join("");
function poolNote(){
  const diet = document.getElementById("sv-diet").value;
  const n = pool(diet, "balanced", avoid).length;
  const el = document.getElementById("poolnote");
  el.textContent = `${n} of ${FOODS.length} foods available under these rules.`;
  el.className = "avoidnote" + (n < 25 ? " thin" : "");
}
document.getElementById("avoidchips").addEventListener("click", e => {
  const c = e.target.closest("[data-avoid]"); if (!c) return;
  const t = c.dataset.avoid;
  if (avoid.has(t)) avoid.delete(t); else avoid.add(t);
  c.setAttribute("aria-pressed", String(avoid.has(t)));
  poolNote(); renderScarcity(); persistLocal();
});

/* ---------------- scarcity sidebar ---------------- */
function renderScarcity(){
  const t = targets();
  const diet = document.getElementById("sv-diet").value;
  const keys = pool(diet, "balanced", avoid);
  const rows = COUNTED.filter(n => t[n])
    .map(n => ({n, c: supplierCount(n, keys, t)})).sort((a, b) => a.c - b.c);
  const max = Math.max(...rows.map(r => r.c));
  document.getElementById("scarcity").innerHTML = rows.map(r => `<div class="nrow ${r.c<=3?"gap":""}">
    <span class="nlabel"><span>${META[r.n].label}</span></span>
    <span><span class="nbar"><i style="width:${100*r.c/max}%"></i></span></span>
    <span class="npct">${r.c}</span></div>`).join("")
    + `<p class="note" style="padding:12px 14px;display:block">Number of the ${keys.length} foods
       allowed by these rules that supply at least 10% of your target per 100 calories. The short bars at the top are why some diets are
       hard to complete: few foods carry them, so the solver weights them heavily.</p>`;
}

