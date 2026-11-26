// Smoke test: loads index.html in headless Chromium and runs the solver for every diet pattern.
// Needs Playwright:  npm i -D playwright@1.48.2 && npx playwright install chromium
// Run:               node tests/smoke.js
const { chromium } = require('playwright');
const path = require('path');
const DIETS = ["anything","pescatarian","vegetarian","vegan","paleo","whole30","mediterranean",
               "keto","lowcarb","highprotein","carnivore","raw"];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  for (const diet of DIETS) {
    const r = await page.evaluate(diet => {
      const p = solveDay({diet, maxFoods: 14, style: "balanced", seed: null, avoid: new Set()});
      const e = evaluate(p, diet);
      return {met: TARGETS - e.short.length, total: TARGETS, short: e.short, over: e.over, foods: Object.keys(p).length,
              kcalPct: Math.round(100 * e.kcal / targets().kcal),
              uncommon: Object.keys(p).filter(k => BY[k].common === 0)};
    }, diet);
    console.log(`${diet.padEnd(14)} ${r.met}/${r.total}  foods ${r.foods}  kcal ${r.kcalPct}%` +
      (r.uncommon.length ? `  uncommon: ${r.uncommon.join(', ')}` : '') +
      (r.short.length ? `  short: ${r.short.join(', ')}` : '') + (r.over.length ? `  OVER: ${r.over}` : ''));
    if (r.over.length) errors.push(`${diet}: over an upper limit`);
    // the solver prefers everyday foods (UNCOMMON_WEIGHT); before it, a default day held ~3
    // uncommon ones (mamey sapote, cottonseed oil, goose egg). Carnivore needs organ meats.
    if (diet !== "carnivore" && r.uncommon.length > 1) errors.push(`${diet}: ${r.uncommon.length} uncommon foods`);
    if (r.kcalPct > 105) errors.push(`${diet}: calories ${r.kcalPct}% of target`);
  }
  // Upper limits are a hard rule for every bias and profile, not just the default one.
  // (female 31-50 + raw once put 5 g of iodized salt in the day; ordinary + raw rounded calcium over)
  const breaches = await page.evaluate(DIETS => {
    const out = [];
    for (const [sex, age, kcal] of [["male", 40, 2500], ["female", 40, 2000], ["female", 75, 1600]]){
      profile = {sex, age, kcal};
      for (const style of ["balanced", "fewest", "light", "ordinary"])
        for (const maxFoods of [14, 7]) for (const diet of DIETS){
          const p = solveDay({diet, maxFoods, style, seed: null, avoid: new Set()});
          const e = evaluate(p, diet), at = `${sex} ${age} ${kcal} kcal, ${style}, ${maxFoods} foods, ${diet}`;
          if (e.over.length) out.push(`OVER ${at}: ${e.over}`);
          // realistic portions: nothing past its serving cap (5 g of rounding allowed), and at
          // most two meat or fish mains outside carnivore
          const big = Object.keys(p).filter(k => p[k] > capOf(k) + 5);
          if (big.length) out.push(`PORTION ${at}: ${big.map(k => `${k} ${p[k]} g`)}`);
          if (diet !== "carnivore" && Object.keys(p).filter(isMain).length > MAX_MAINS) out.push(`MAINS ${at}`);
        }
    }
    return out;
  }, DIETS);
  console.log(`limit/portion sweep: ${breaches.length} problems`);
  breaches.forEach(b => errors.push(b));

  // Your-own-food input is the one place user text reaches food names, which are put into
  // HTML unescaped everywhere; meal moves rewrite plan order and meals together.
  const unit = await page.evaluate(() => {
    const fails = [], ok = (cond, what) => { if (!cond) fails.push(what); };
    const zeros = () => new Array(ORDER.length).fill(0);
    ok(!/[<>"&]/.test(cleanText('Bar<script>alert(1)</script> "x" & <img src=y onerror=z>')),
       "cleanText leaves markup characters");
    ok(normCustom({k: "c-x1", cls: "plant", serv: 10, n: [1, 2]}) === null, "normCustom accepts a short nutrient list");
    ok(normCustom({k: "oats", cls: "plant", serv: 10, n: zeros()}) === null, "normCustom accepts a built-in key");
    ok(normCustom({k: "c-x2", cls: "plant", serv: 0, n: zeros()}) === null, "normCustom accepts a 0 g serving");
    ok(normCustom({k: "c-x3", cls: "alien", serv: 10, n: zeros()}) === null, "normCustom accepts an unknown class");
    const f = normCustom({k: "c-x4", name: "<b>Granola</b>", cls: "plant", serv: 50, tags: "treenut bogus", n: zeros()});
    ok(f && f.name === "Granola" && f.tags === "treenut" && f.custom, "normCustom doesn't clean a valid food");
    const k = knownOnly({oats: 40, nosuchfood: 10, milk: "x", egg: -5});
    ok(JSON.stringify(k) === '{"oats":40}', "knownOnly keeps unknown, non-numeric or negative entries");
    // share links are attacker-controlled: inherited names must not pass, amounts are clamped
    const h = knownOnly(JSON.parse('{"toString":5,"constructor":3,"__proto__":4,"oats":1e9}'));
    ok(JSON.stringify(h) === JSON.stringify({oats: 50 * BY.oats.serv}), "knownOnly lets inherited names or huge amounts through");
    const day = {v: 1, plan: {oats: 40, salmon: 113}, meals: {oats: 0, salmon: 2}, foods: []};
    ok(JSON.stringify(JSON.parse(b64dec(b64enc(JSON.stringify(day))))) === JSON.stringify(day), "share link round trip");
    ok(b64dec(b64enc("Annie’s café")) === "Annie’s café", "share link loses non-ASCII text");
    // moving the first lunch food up one step puts it at the end of breakfast (old single-index
    // meals still load)
    plan = {oats: 40, egg: 50, salmon: 113}; meals = {oats: 0, egg: 0, salmon: 1};
    const t = mealTokens(), i = t.indexOf("salmon@1");
    t.splice(i - 1, 0, t.splice(i, 1)[0]); applyTokens(t);
    ok(meals.salmon[0] === 113 && !meals.salmon[1] && Object.keys(plan).join() === "oats,egg,salmon",
       "moving past a meal header");
    // the same food in two meals: separate rows, plan[k] is the sum, removing one keeps the other,
    // and moving one into the other's meal merges them
    addMeal = 1; addFood("oats");
    ok(meals.oats[0] === 40 && meals.oats[1] === BY.oats.serv && plan.oats === 40 + BY.oats.serv,
       "adding a food already at breakfast to lunch");
    ok(mealTokens().filter(x => x.startsWith("oats@")).length === 2, "two rows for one food");
    const u = mealTokens(), j = u.indexOf("oats@1"), lunch = u.indexOf("#1");
    u.splice(lunch, 0, u.splice(j, 1)[0]); applyTokens(u);   // drag lunch oats up into breakfast
    ok(meals.oats[0] === 40 + BY.oats.serv && !meals.oats[1] && plan.oats === 40 + BY.oats.serv, "merging rows");
    addFood("oats"); setPortion("oats", 0, 0);
    ok(!meals.oats[0] && meals.oats[1] === BY.oats.serv && plan.oats === BY.oats.serv, "removing one meal's row");
    addMeal = 0;
    // reordering inside a meal when a food is also in an earlier meal (oats at breakfast and lunch
    // used to pin lunch oats to the top, so salmon snapped back below it)
    plan = {oats: 80, egg: 50, salmon: 113}; meals = {oats: {0: 40, 1: 40}, egg: 0, salmon: 1}; rowOrder = [];
    const v = mealTokens(), sal = v.indexOf("salmon@1"), lo = v.indexOf("oats@1");
    v.splice(lo, 0, v.splice(sal, 1)[0]); applyTokens(v);
    ok(mealRows(1).join() === "salmon,oats" && mealRows(0).join() === "oats,egg", "reordering within a meal with a shared food");
    // a removed food key still loads as the food that replaced it (days saved before the change)
    ok(Object.values(RENAMED).every(k => Object.prototype.hasOwnProperty.call(BY, k)) &&
       Object.keys(RENAMED).every(k => !Object.prototype.hasOwnProperty.call(BY, k)), "RENAMED points at a missing or live key");
    ok(JSON.stringify(knownOnly({salmon_farmed: 85, salmon: 50})) === JSON.stringify({salmon: 135}), "renamed key in a plan");
    ok(JSON.stringify(cleanMeals({salmon_farmed: {1: 85}})) === JSON.stringify({salmon: {1: 85}}), "renamed key in meals");
    ok(cleanOrder(["salmon_farmed@1", "salmon@1"]).join() === "salmon@1", "renamed key in row order");
    // ultra-processed foods (NOVA 4) are out; a day that used one loads and names what was left out
    ok(FOODS.every(f => f.custom || [1, 2, 3].includes(f.nova) || (f.nova === 4 && f.exc)), "NOVA group 4 food without an exception");
    noteRemoved({oats: 40, potatochips: 28});
    ok(!document.getElementById("removedmsg").hidden &&
       document.getElementById("removedmsg").textContent.includes(REMOVED.potatochips), "removed food not named");
    noteRemoved({});
    ok(/aria-label="NOVA group 1, unprocessed/.test(novaTag(BY.oats)), "badge has no spoken label");
    // a day already over a limit (sodium, with canned food) still gets suggestions; ruling out
    // every food with any sodium used to leave the panel empty
    profile = {sex: "male", age: 40, kcal: 2500};
    const salty = {oats: 80, blackbean_can: 240, tomatosauce: 244, salmon: 113, spinach: 180, cheddar: 56};
    ok(ulLoad(salty, limits()).Na > limits().Na && suggest(salty).length > 0, "no suggestions for a day over a limit");
    // whole-food score: share of calories from NOVA 1-2 (oats 1, cheddar 3)
    const wf = wholeFoodPct({oats: 100, cheddar: 100}), kO = BY.oats.n[IDX.kcal], kC = BY.cheddar.n[IDX.kcal];
    ok(BY.oats.nova === 1 && BY.cheddar.nova === 3 && wf === Math.round(100 * kO / (kO + kC)), "whole-food score");
    ok(wholeFoodPct({}) === null, "whole-food score of an empty day");
    // search: every word must match, and the plain cooked everyday food ranks first
    search.value = "chicken breast"; runSearch();
    ok(hits.length && hits.every(f => /chicken/i.test(f.name) && /breast/i.test(f.name)) &&
       !/\braw\b/i.test(hits[0].name) && hits[0].common !== 0, "search ranking");
    search.value = "spleen"; runSearch();   // uncommon foods are never hidden, only ranked lower
    ok(hits.length > 0 && hits.every(f => f.common === 0), "uncommon-only search");
    search.value = "liver"; runSearch();
    ok(hits.length > 0, "uncommon foods findable");
    search.value = ""; runSearch();
    // recent foods: every add moves the food to the front; stored keys are cleaned like any input
    plan = {}; meals = {}; rowOrder = []; recent = [];
    addFood("oats"); addFood("salmon"); addFood("oats");
    ok(recent.join() === "oats,salmon", "recent order");
    ok(cleanRecent(["salmon_farmed", "toString", "oats", 5, "oats"]).join() === "salmon,oats", "cleanRecent");
    plan = {}; meals = {}; rowOrder = []; recent = [];
    // overall nutrient density: averaged % of targets, each capped at 100%; oil scores near zero,
    // and per 100 kcal the leaders are vegetables
    const tg = targets(), dSp = densityOf(BY.spinach, BY.spinach.serv, tg), dOil = densityOf(BY.oliveoil, BY.oliveoil.serv, tg);
    ok(dSp.score > 0 && dSp.score <= 100 && dOil.score < dSp.score && dSp.top.length > 0, "density score");
    document.getElementById("br-nut").value = "density"; document.getElementById("br-basis").value = "kcal";
    document.getElementById("br-cat").value = ""; renderBrowse();
    const lead = [...document.querySelectorAll("#brtable tbody tr")].slice(0, 5).map(r => r.querySelector(".cat").textContent);
    ok(lead.length === 5 && lead.filter(c => c === "Vegetables").length >= 3, "density per 100 kcal leaders: " + lead);
    // the calorie trim never removes a food the user kept
    profile = {sex: "male", age: 40, kcal: 2500};
    const seed = {oliveoil: 10, butter: 10, walnut: 200, peanut: 200, milk: 244};
    const p = solveDay({diet: "anything", maxFoods: 14, style: "balanced", seed, avoid: new Set()});
    ok(Object.keys(seed).every(s => p[s] > 0), "kept foods removed by the solver");
    return fails;
  });
  console.log(`unit checks: ${unit.length ? unit.join('; ') : 'ok'}`);
  unit.forEach(u => errors.push(u));

  // A phone (375 px, touch): nothing may widen the page (a one-line row of recent foods once
  // stretched the layout grid to 1,200 px), and inputs need 16 px text or iOS zooms on focus.
  const phone = await browser.newPage({viewport: {width: 375, height: 812}, hasTouch: true, isMobile: true});
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const mobile = await phone.evaluate(() => {
    ["oats", "salmon", "spinach", "lentil", "almond", "egg", "sweetpot", "milk", "blueberry", "tilapia"].forEach(k => addFood(k));
    return {wide: document.documentElement.scrollWidth > innerWidth,
            small: [...document.querySelectorAll("input:not([type=checkbox]):not([type=file]),select")]
              .filter(el => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.id || el.className)};
  });
  console.log(`phone layout: ${mobile.wide ? "WIDER THAN THE SCREEN" : "fits"}, inputs under 16 px: ${mobile.small.length}`);
  if (mobile.wide) errors.push("phone: page wider than the screen");
  if (mobile.small.length) errors.push("phone: inputs under 16 px: " + mobile.small.join(", "));
  await browser.close();
  if (errors.length){ console.error(errors); process.exit(1); }
})();
