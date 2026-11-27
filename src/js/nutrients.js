/* ---------------- targets ---------------- */
const key = () => profile.sex + ":" + profile.age;
function targets(){ const t = Object.assign({}, D.dri[key()]); t.kcal = profile.kcal; return t; }
function limits(){ return D.ul[key()]; }

function totals(p){
  const t = new Array(ORDER.length).fill(0);
  for (const k in p){ const f = BY[k], g = p[k] / 100;
    for (let i = 0; i < ORDER.length; i++) t[i] += f.n[i] * g; }
  return t;
}
function unitOf(n){ return (META[n] ? META[n].unit : "g").replace(" RAE","").replace(" DFE",""); }
function fmt(v, n){
  const a = Math.abs(v);
  const s = a >= 100 ? Math.round(v) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  return s + " " + unitOf(n);
}

/* ---------------- scarcity: how few foods supply each nutrient ---------------- */
function supplierCount(n, keys, t){
  if (!t[n]) return 999;
  let c = 0;
  keys.forEach(k => { const f = BY[k], kc = f.n[IDX.kcal]; if (!kc) return;
    if ((f.n[IDX[n]] * 100 / kc) / t[n] >= 0.10) c++; });
  return c;
}
function scarcityFor(keys){
  const t = targets(), out = {};
  COUNTED.forEach(n => { out[n] = 1 / Math.max(1, supplierCount(n, keys, t)); });
  return out;
}
const ALLKEYS = FOODS.map(f => f.k);
let SCARCE = scarcityFor(ALLKEYS);

/* ---------------- nutrient explainers (the "i" panels) ---------------- */
// does = what it does in the body; why = why it matters / who runs short / where it comes from.
const DETAIL = {
  kcal:{does:"Energy. Each gram of protein or carbohydrate gives about 4 kcal and each gram of fat about 9.",
    why:"The one target you set yourself rather than a DRI. Sitting well under it for weeks means weight loss; well over it, weight gain."},
  protein:{does:"Supplies amino acids to build and repair muscle, enzymes, antibodies and hormones. Nine of them cannot be made by the body and must come from food.",
    why:"The RDA is 0.8 g per kg of body weight. Older adults and people doing strength training often do better at 1.2–1.6 g/kg."},
  fat:{does:"Dense energy, the carrier that lets you absorb vitamins A, D, E and K, and the only source of the two essential fats, linoleic acid and ALA.",
    why:"There is no target for total fat; the accepted range is 20–35% of calories. The kind of fat matters more than the amount."},
  carb:{does:"The body’s preferred fuel, especially for the brain and for hard exercise. Fiber is counted inside this number.",
    why:"The 130 g RDA covers the brain’s glucose use. Below that the body runs on ketones and makes its own glucose from protein, which is how keto works."},
  netcarb:{does:"Carbohydrate minus fiber — the part that is digested into sugar.",
    why:"What the keto (≤30 g) and low-carb (≤100 g) patterns cap."},
  fiber:{does:"Plant carbohydrate you can’t digest. It feeds gut bacteria, slows how fast sugar reaches the blood, lowers LDL cholesterol and keeps you regular.",
    why:"The target (14 g per 1,000 kcal) comes from heart-disease data. Most adults eat about half of it. Legumes, seeds, berries and whole grains are the big sources."},
  LA:{does:"Linoleic acid, the essential omega-6 fat. It is part of every cell membrane and keeps the skin’s water barrier intact.",
    why:"True deficiency (scaly skin, slow healing) is rare. Seeds, nuts and their oils supply plenty."},
  ALA:{does:"Alpha-linolenic acid, the essential omega-3 fat. The body converts a small share of it into EPA and DHA.",
    why:"The only omega-3 with a DRI. Flax, chia, hemp, walnuts and canola oil are the rich sources."},
  EPADHA:{does:"The long-chain omega-3s concentrated in the brain and retina. They also make signalling molecules that help resolve inflammation.",
    why:"No DRI exists. Heart guidelines suggest about 250–500 mg a day — roughly two servings of oily fish a week."},
  Ca:{does:"Builds bones and teeth, which hold 99% of it, and is needed for every muscle contraction, nerve signal and blood clot.",
    why:"When intake runs short, the body pulls calcium out of bone to keep blood levels steady, which weakens bone over years."},
  Fe:{does:"The core of hemoglobin and myoglobin, which carry oxygen in blood and muscle, and of several energy-producing enzymes.",
    why:"Running short causes anemia: tiredness, breathlessness, feeling cold. Vitamin C in the same meal helps plant iron absorb."},
  Mg:{does:"A helper for more than 300 enzymes — making energy (ATP), DNA and protein — and a regulator of muscle, nerve and heart rhythm.",
    why:"About half of US adults fall short. Seeds, nuts, legumes, whole grains and leafy greens are the main sources. Its upper limit applies only to supplements."},
  P:{does:"Part of bone mineral, of ATP (the cell’s energy currency), and of DNA and cell membranes.",
    why:"It is in nearly every protein food, so shortfalls are rare."},
  K:{does:"The main electrolyte inside cells. It sets the electrical charge that lets nerves and muscles fire and offsets sodium’s effect on blood pressure.",
    why:"Higher intakes go with lower blood pressure and stroke risk. Potatoes, beans, leafy greens, fruit and dairy are the big sources."},
  Zn:{does:"Needed by hundreds of enzymes for immunity, wound healing, DNA synthesis, taste and smell, and sperm production.",
    why:"The body stores very little, so it needs a steady supply. Oysters, red meat, shellfish, seeds and legumes lead."},
  Cu:{does:"Works with iron to make red blood cells, and is needed for collagen, energy production and the body’s own antioxidant enzymes.",
    why:"Liver, shellfish, nuts, seeds, cocoa and mushrooms are rich. Very high zinc intake can block its absorption."},
  Mn:{does:"Helps enzymes that form bone, process carbohydrate and cholesterol, and neutralise free radicals inside mitochondria.",
    why:"Whole grains, nuts, legumes, tea and spices supply far more than the target; deficiency is almost unknown."},
  Na:{does:"The main electrolyte outside cells. It controls fluid volume and blood pressure and lets nerves and muscles fire.",
    why:"Nearly everyone gets more than enough. Higher intakes raise blood pressure in many people, so this line is a ceiling."},
  Se:{does:"Built into selenoproteins that protect cells from oxidative damage and switch thyroid hormone into its active form.",
    why:"Food content follows soil content. Brazil nuts, seafood, organ meat and eggs are reliable; more than 400 mcg a day causes brittle hair and nails."},
  I:{does:"An essential part of thyroid hormone, which sets your metabolic rate and directs brain development in pregnancy.",
    why:"Short supply causes goiter and an underactive thyroid. Few foods carry much: seafood, dairy, eggs, seaweed and iodized salt."},
  A:{does:"Needed for vision in low light, healthy skin and the linings of the gut and lungs, immune function and cell growth.",
    why:"It comes ready-made from liver, dairy and eggs, or as beta-carotene from orange and dark-green plants, which the body converts as needed."},
  C:{does:"An antioxidant needed to make collagen (skin, blood vessels, gums) and some neurotransmitters. It also boosts absorption of plant iron.",
    why:"Humans can’t make it; a total lack causes scurvy within weeks. Peppers, citrus, kiwi, berries, guava and cabbage-family vegetables are rich."},
  D:{does:"Lets the gut absorb calcium and phosphorus; also involved in muscle strength and immune function.",
    why:"Sun on skin is the usual source. Food sources are few: oily fish, egg yolks and UV-exposed mushrooms."},
  E:{does:"A fat-soluble antioxidant that protects cell membranes, and the fats carried in LDL, from oxidation.",
    why:"Most adults fall short from food alone. Sunflower seeds, almonds, nut and seed oils and avocado lead."},
  K1K2:{does:"Switches on the proteins that make blood clot and the ones that lock calcium into bone.",
    why:"Leafy greens supply K1; natto, cheese and egg yolk supply K2. If you take warfarin, keep intake steady rather than avoiding it."},
  B1:{does:"Thiamin helps turn carbohydrate into energy and keeps nerves working.",
    why:"Heavy alcohol use raises the risk of running short. Pork, whole and enriched grains, legumes and seeds are good sources."},
  B2:{does:"Riboflavin forms coenzymes used in energy production and in activating other B vitamins.",
    why:"Dairy, eggs, meat, almonds and mushrooms are the main sources."},
  B3:{does:"Niacin forms NAD, used by over 400 enzymes in energy metabolism and DNA repair.",
    why:"The body can make some from the amino acid tryptophan. Meat, fish, peanuts and mushrooms are rich. Its upper limit applies only to supplements."},
  B6:{does:"A helper for more than 100 enzymes, mostly in protein metabolism; needed to make neurotransmitters and hemoglobin.",
    why:"Fish, poultry, potatoes, chickpeas, bananas and pistachios are good sources. Its upper limit concerns supplements."},
  B9:{does:"Folate is needed to copy DNA and divide cells, and works with B12 to make red blood cells.",
    why:"Critical just before and early in pregnancy to prevent neural-tube defects. Legumes, leafy greens, asparagus and liver lead."},
  B12:{does:"Needed to make red blood cells, maintain the insulation around nerves, and copy DNA.",
    why:"Only bacteria make it, so it reaches food through animal products — or through fortified foods, which are the practical vegan source (fortified soy, pea, coconut and cashew milks here). Lack causes anemia and nerve damage; absorption falls with age and with metformin or acid blockers."},
  choline:{does:"Builds cell membranes, makes the neurotransmitter acetylcholine, and helps move fat out of the liver.",
    why:"The body makes some, but not enough. Eggs, liver, meat, fish and soybeans are the richest sources."},
  Mo:{does:"A helper for enzymes that break down sulfur-containing amino acids, purines and some toxins.",
    why:"Legumes, grains and nuts provide plenty; deficiency has only been seen with long-term tube feeding."},
};
const NO_SOURCES = new Set(["kcal","fat","carb","netcarb","Na"]);   // "eat more of this" makes no sense
let openNotes = new Set();
const amountIn = (f, n, g) => n === "netcarb" ? netCarbOf(f, g) : f.n[IDX[n]] * g / 100;
function noteHTML(n){
  const d = DETAIL[n] || {}, m = META[n];
  const caveat = m && m.note && m.note !== d.why ? `<p class="nd-cav">${m.note}</p>` : "";
  // what in today's food supplies it
  const rows = Object.keys(plan).map(k => ({k, v: amountIn(BY[k], n, plan[k])}))
                 .filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  const total = rows.reduce((a, r) => a + r.v, 0);
  const top = rows.slice(0, 5), rest = rows.slice(5);
  const restV = rest.reduce((a, r) => a + r.v, 0);
  const share = v => total ? Math.round(100 * v / total) : 0;
  const mine = rows.length
    ? `<ul class="nd-list">${top.map(r => `<li><span>${BY[r.k].name}</span>
        <span class="mono">${fmt(r.v, n === "netcarb" ? "carb" : n)} · ${share(r.v)}%</span></li>`).join("")}
        ${rest.length ? `<li class="nd-more"><span>${rest.length} other food${rest.length > 1 ? "s" : ""}</span>
          <span class="mono">${share(restV)}%</span></li>` : ""}</ul>`
    : `<p class="nd-none">Nothing in today’s food supplies it yet.</p>`;
  // richest realistic servings not already in the day
  let src = "";
  if (!NO_SOURCES.has(n)){
    const tg = targets()[n];
    const best = FOODS.filter(f => !(f.k in plan) && !tagsOf(f.k).some(t => avoid.has(t)))
      .map(f => ({f, v: f.n[IDX[n]] * f.serv / 100})).filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v).slice(0, 5);
    if (best.length) src = `<div class="nd-h">Richest per serving — tap to add</div>
      <div class="nd-src">${best.map(x => `<button class="nd-chip" data-addsrc="${x.f.k}"
        title="Add 1 × ${x.f.sl} of ${x.f.name}">${x.f.name}
        <small>${x.f.sl} · ${tg ? Math.round(100 * x.v / tg) + "%" : fmt(x.v, n)}</small></button>`).join("")}</div>`;
  }
  const ul = limits()[n], soft = D.softUl[n];
  const lim = ul ? `<p class="nd-lim">Upper limit ${fmt(ul, n)}${n === "A" ? " (preformed A only)" : ""}.</p>`
            : soft ? `<p class="nd-lim">Advisory upper limit ${fmt(soft, n)} (not enforced).</p>` : "";
  return `${d.does ? `<p class="nd-does">${d.does}</p>` : ""}${d.why ? `<p>${d.why}</p>` : ""}${caveat}${lim}
    <div class="nd-h">In today’s food${rows.length ? ` — ${fmt(total, n === "netcarb" ? "carb" : n)}` : ""}</div>${mine}${src}`;
}

/* ---------------- coverage panel ---------------- */
// Whole-food score: % of a day's calories from NOVA group 1 (unprocessed or minimally processed)
// and group 2 (cooking ingredients). Group 3 and the two group-4 exceptions are the rest; your own
// foods have no group and are left out. null when nothing in the day has a group.
// Group 2 also holds oils and sugars, so they are shown separately: a day of fruit and added sugar
// would otherwise read 100% "whole food". Shares are of the day's calories from grouped foods.
const isOil = f => f.n[IDX.kcal] > 0 && 9 * f.n[IDX.fat] / f.n[IDX.kcal] > 0.8;
const isSweetener = f => /\b(sugar|honey|syrup|molasses|agave)\b/i.test(f.name) || tagsOf(f.k).includes("addedsugar");
function wholeFood(p){
  let all = 0, whole = 0, oil = 0, sugar = 0;
  for (const k in p){
    const f = BY[k]; if (!f || !f.nova) continue;
    const kc = f.n[IDX.kcal] * p[k] / 100;
    all += kc; if (f.nova <= 2) whole += kc;
    if (f.nova === 2){ if (isOil(f)) oil += kc; else if (isSweetener(f)) sugar += kc; }
  }
  const pc = x => Math.round(100 * x / all);
  return all > 0 ? {pct: pc(whole), oil: pc(oil), sugar: pc(sugar)} : null;
}
const wholeFoodPct = p => { const w = wholeFood(p); return w && w.pct; };
// "incl. 6% added fat · 2% sugar" under the score (oil, butter, lard); empty when neither is in the day
const wholeFoodSub = w => !w ? "" : [w.oil ? w.oil + "% added fat" : "", w.sugar ? w.sugar + "% sugar" : ""]
  .filter(Boolean).join(" · ").replace(/^./, s => "incl. " + s);
// A counted nutrient at 85-99% of its target is roughly met: daily intake is noisy and food data
// varies more than that, so it isn't shown as a shortfall.
const ROUGHLY = 84.5;   // what shows as 85% (rounded) counts as roughly met, as 99.5% shows as 100% and counts as met
function renderCoverage(){
  const tot = totals(plan), tg = targets(), ul = limits(), load = ulLoad(plan);
  let met = 0;
  const rows = ORDER.map(n => {
    const target = tg[n];
    // molybdenum: amount only. Most foods read 0 (USDA doesn't measure it), so a % of its RDA
    // would mislead either way; its upper limit is still checked through `over`
    const p = target && n !== "Mo" ? 100 * tot[IDX[n]] / target : null;
    const over = ul[n] && load[n] > ul[n] * 1.001;
    const soft = D.softUl[n] && tot[IDX[n]] > D.softUl[n];
    const counted = COUNTED.includes(n) || n === "kcal";
    const ok = p !== null && p >= 99.5;
    const near = !ok && p !== null && p >= ROUGHLY;
    if (counted && ok) met++;
    return {n, p, over, soft, ok, near, counted, amt: tot[IDX[n]]};
  });
  const netcarb = Object.keys(plan).reduce((a, k) => a + netCarbOf(BY[k], plan[k]), 0);
  rows.splice(ORDER.indexOf("carb") + 1, 0,
    {n: "netcarb", p: null, over: false, soft: false, ok: true, counted: false, amt: netcarb});
  const gaps = rows.filter(r => r.counted && !r.ok && !r.near), close = rows.filter(r => r.counted && r.near);
  // lowest % first, so gaps lead; informational rows (sodium, fat, carbs, EPA+DHA) keep their order at the end
  const key = r => r.counted && r.p !== null ? r.p : Infinity;
  const sorted = gapsFirst
    ? rows.slice().sort((a, b) => key(a) - key(b) || rows.indexOf(a) - rows.indexOf(b))
    : rows;

  document.getElementById("coverage").innerHTML = sorted.map(r => {
    const m = META[r.n] || {label:"Net carbs", unit:"g", group:"macro",
      note:"Carbohydrate minus fiber \u2014 what the keto and low-carb patterns cap."};
    const cls = r.over ? "over" : r.counted && r.near ? "near" : r.counted && !r.ok ? "gap" : "";
    const w = r.p === null ? 0 : Math.max(0, Math.min(100, r.p));
    const label = r.n === "EPADHA" ? m.label + " · no DRI" : r.n === "Mo" ? m.label + " · info only" : m.label;
    const shown = r.p === null ? "—" : (r.p >= 999 ? "999+" : (r.counted && r.near ? "≈" : "") + Math.round(r.p) + "%");
    return `<div class="nrow ${cls}">
      <span class="nlabel"><span>${label}</span><button class="info" data-note="${r.n}" title="About ${m.label}"
        aria-label="About ${m.label}" aria-expanded="${openNotes.has(r.n)}">i</button></span>
      <span><span class="nbar"><i style="width:${w}%"></i></span>
        <span class="namt">${fmt(r.amt, r.n)}${r.soft ? " ⚠" : ""}</span></span>
      <span class="npct">${shown}</span>
      ${openNotes.has(r.n) ? `<div class="note" data-notefor="${r.n}">${noteHTML(r.n)}</div>` : ""}
    </div>`;
  }).join("");

  const mass = Object.values(plan).reduce((a, b) => a + b, 0);
  const el = id => document.getElementById(id);
  el("s-met").textContent = met + "/" + TARGETS;
  el("s-met").className = "v " + (met === TARGETS ? "good" : met ? "bad" : "");
  el("s-kcal").textContent = Math.round(tot[IDX.kcal]);
  el("s-mass").textContent = Math.round(mass) + " g";
  const whole = wholeFood(plan);
  el("s-whole").textContent = whole === null ? "—" : whole.pct + "%";
  el("s-whole-sub").textContent = wholeFoodSub(whole);
  el("covhint").textContent = !Object.keys(plan).length ? "Add food to begin"
    : [gaps.length ? gaps.length + " short" : "", close.length ? close.length + " roughly met" : ""].filter(Boolean).join(" · ")
      || "Every target met";
}

