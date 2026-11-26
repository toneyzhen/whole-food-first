const D = /*__DATA__*/;
const ORDER = D.order, META = D.meta, FOODS = D.foods;
const BY = {}; FOODS.forEach(f => BY[f.k] = f);
const IDX = {}; ORDER.forEach((n, i) => IDX[n] = i);
// Tracked, but not scored as targets. Molybdenum is informational because USDA doesn't measure it:
// most foods read 0, so its "gap" was missing data, not a real shortfall (dietary deficiency is
// essentially unknown).
const INFO = new Set(["kcal","EPADHA","fat","carb","Na","Mo"]);
const COUNTED = ORDER.filter(n => !INFO.has(n));
const TARGETS = COUNTED.length + 1;                     // the counted nutrients + calories (27)

// The vitamin A UL covers preformed retinol (liver, egg, dairy, fish) only; provitamin A
// carotenoids from plants have no upper limit. Without this split, eating a lot of spinach
// falsely "maxes out" vitamin A and locks the solver out of every animal food.
function ulAmount(f, n, grams){
  if (n === "netcarb") return netCarbOf(f, grams);
  if (n === "A" && f.cls === "plant") return 0;
  return f.n[IDX[n]] * grams / 100;
}
function ulLoad(p, caps){
  const out = {};
  for (const n in Object.assign({}, limits(), caps || {})) out[n] = 0;
  for (const k in p){ const f = BY[k]; for (const n in out) out[n] += ulAmount(f, n, p[k]); }
  return out;
}

const ALLCLS = ["plant","dairy","egg","fish","meat"];
// Base patterns restrict which kinds of food are allowed; the macro patterns add a rule
// on top (a net-carb ceiling, a protein floor, or a tag exclusion).
const DIETS = {
  anything:     {label:"Anything",      cls:ALLCLS},
  pescatarian:  {label:"Pescatarian",   cls:["plant","dairy","egg","fish"]},
  vegetarian:   {label:"Vegetarian",    cls:["plant","dairy","egg"]},
  vegan:        {label:"Vegan",         cls:["plant"]},
  paleo:        {label:"Paleo",         cls:ALLCLS, no:["grain","legume","dairy","soy","peanut"]},
  whole30:      {label:"Whole30",       cls:ALLCLS, no:["grain","legume","dairy","soy","peanut","addedsugar"]},
  mediterranean:{label:"Mediterranean", cls:ALLCLS, no:["redmeat"]},
  keto:         {label:"Keto",          cls:ALLCLS, netCarbMax:30},
  lowcarb:      {label:"Low-carb",      cls:ALLCLS, netCarbMax:100},
  highprotein:  {label:"High-protein",  cls:ALLCLS, proteinPct:25},
  carnivore:    {label:"Carnivore",     cls:["dairy","egg","fish","meat"], no:["grain","addedsugar"]},
  raw:          {label:"Raw",           cls:ALLCLS, rawOnly:true},
};
const AVOIDABLE = [["dairy","Dairy"],["egg","Eggs"],["gluten","Gluten"],["peanut","Peanuts"],
  ["treenut","Tree nuts"],["soy","Soy"],["fish","Fish"],["shellfish","Shellfish"],
  ["sesame","Sesame"],["nightshade","Nightshades"],["fortified","Fortified foods"]];
let avoid = new Set();
const tagsOf = k => (BY[k].tags || "").split(" ").filter(Boolean);

/* ---------------- your own foods (from a Nutrition Facts label) ---------------- */
// Kept in this browser's localStorage and merged into FOODS before anything indexes it.
// Names are user input that the app interpolates into HTML everywhere, so markup characters
// are neutralised at the door: tags dropped, quotes made typographic, & spelled out.
const CUSTOM_KEY = "completeday-foods";
const cleanText = s => String(s == null ? "" : s).replace(/<[^>]*>?/g, "").replace(/[<>]/g, "")
  .replace(/['`]/g, "’").replace(/"/g, "”").replace(/&/g, " and ")
  .replace(/\s+/g, " ").trim().slice(0, 60);
const CLS_TAG = {dairy: "dairy", egg: "egg", fish: "fish"};
function normCustom(f){
  if (!f || typeof f.k !== "string" || !/^c-[a-z0-9]+$/.test(f.k) || BY[f.k]) return null;
  if (!ALLCLS.includes(f.cls) || !(f.serv > 0 && f.serv <= 1000)) return null;
  if (!Array.isArray(f.n) || f.n.length !== ORDER.length
      || !f.n.every(v => typeof v === "number" && isFinite(v) && v >= 0)) return null;
  const okTags = new Set(AVOIDABLE.map(([t]) => t));
  const tags = String(f.tags || "").split(" ").filter(t => okTags.has(t));
  return {k: f.k, name: cleanText(f.name) || "My food", cat: "My foods", cls: f.cls, serv: +f.serv,
    sl: cleanText(f.sl) || `${+f.serv} g`, tags: [...new Set(tags)].join(" "), raw: 0, n: f.n, custom: true};
}
function customFoods(){ return FOODS.filter(f => f.custom); }
function saveCustom(){
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customFoods().map(({cat, raw, custom, ...f}) => f))); }
  catch (e) {}
}
try {
  const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  (Array.isArray(arr) ? arr : []).map(normCustom).filter(Boolean)
    .forEach(f => { FOODS.push(f); BY[f.k] = f; });
} catch (e) {}
// Drop food keys this browser doesn't know (a deleted custom food, one from another viewer, or
// anything in a share link or backup file) and clamp amounts to the builder's 50 servings.
// hasOwnProperty, not BY[k]: "toString" or "constructor" would pass that test and crash rendering.
// Keys that were removed, mapped to the food that replaced them, so days saved, shared or backed
// up before the change still load. Never delete a food key without adding it here.
// (2026-11: duplicates of hand-corrected older foods, removed from the 1,500-food expansion)
const RENAMED = {milk1_nofort: "milk1", milk2_nofort: "milk2", skim_nofort: "skimmilk",
  butter_salted: "butter", butteroil: "ghee", goatmilk_d: "goatmilk", parmesan_hard: "parmesan",
  coconutcream_raw: "coconutcream", whitebean: "cannellini", edamame_frozen: "edamame",
  lupins_cooked: "lupini", morinu_soft: "silkentofu", chbreast_skinless_roast: "chickenbreast",
  flaxseed_whole: "flax", cuminseed: "cumin", jackmackerel_can: "cannedmackerel",
  alaskakingcrab: "crab", northernpike: "pike", salmon_farmed: "salmon", squid_fried: "squid",
  redchili_raw: "chilipepper", parsnip_cooked2: "parsnip", snowpea_raw: "snappea"};
const renamed = k => Object.prototype.hasOwnProperty.call(RENAMED, k) ? RENAMED[k] : k;
// Ultra-processed foods (NOVA group 4) taken out, by key -> name (foods.json `removed`). A day that
// used one still loads; the builder names what was left out instead of dropping it silently.
const REMOVED = D.removed || {};
const removedNames = p => p && typeof p === "object"
  ? Object.keys(p).filter(k => Object.prototype.hasOwnProperty.call(REMOVED, k)).map(k => REMOVED[k]) : [];
function noteRemoved(p){
  const names = removedNames(p);
  const el = document.getElementById("removedmsg");
  el.textContent = names.length ? "Left out of this day because they are ultra-processed (NOVA group 4) "
    + "and no longer in the app: " + names.join(", ") + "." : "";
  el.hidden = !names.length;
}
// The NOVA group badge shown beside a food's name. Your own foods have none.
const NOVA_LABEL = {1: "unprocessed or minimally processed", 2: "culinary ingredient (oil, butter, sugar, salt)",
  3: "processed (cheese, bread, canned, cured or salted food)"};
// role="img" + aria-label so a screen reader says what the number means (title alone is often skipped)
const novaTag = f => !f.nova ? "" : f.exc
  ? `<span class="nova ex" role="img" aria-label="Exception: ultra-processed, kept on purpose"
      title="Ultra-processed (NOVA group 4). ${esc(f.exc)}">exception</span>`
  : `<span class="nova n${f.nova}" role="img" aria-label="NOVA group ${f.nova}, ${NOVA_LABEL[f.nova]}"
      title="NOVA group ${f.nova}: ${NOVA_LABEL[f.nova]}">${f.nova}</span>`;
const knownOnly = p => { const out = {};
  if (p && typeof p === "object") for (const k0 in p){
    const k = renamed(k0);
    if (Object.prototype.hasOwnProperty.call(BY, k) && +p[k0] > 0)
      out[k] = Math.min((out[k] || 0) + +p[k0], 50 * BY[k].serv);   // an old and a new key add up
  }
  return out; };
// Suggestion groups. Nuts and seeds share a category but not a shopping habit, so they
// are split here: seeds are the ones that keep winning on nutrient-per-calorie.
function groupOf(k){
  const f = BY[k];
  if (f.cat === "Nuts & seeds") return tagsOf(k).includes("treenut") ? "Nuts" : "Seeds";
  return f.cat;
}
const GROUPS = ["Vegetables","Fruit","Grains & starches","Legumes & soy","Nuts","Seeds",
                "Dairy","Dairy alternatives","Eggs","Seafood","Meat & poultry","Other"];
let sugOff = new Set();
const netCarbOf = (f, grams) => Math.max(0, f.n[IDX.carb] - f.n[IDX.fiber]) * grams / 100;
// foods where a "normal" portion is small and potency is high
const MAXSERV = {iodizedsalt:3, brazil:2, liver:2, chickenliver:2, nori:5, oyster:2, spirulina:2,
  molasses:2, cocoa:3, oliveoil:3, wheatgerm:2, flax:3, chia:3, sesame:2, eggyolk:4,
  spinach:2, chard:2, beetgreens:2, kale:2, collards:2, bokchoy:2, cabbage:2,
  mushroom:2, uvmushroom:2,
  porkliver:2, lambliver:1, beefkidney:2, caviar:2, eel:2, fishsauce:1, soysauce:1,
  capers:2, pickle:2, amaranthleaf:2, ricebran:2, wheatbran:2, goji:2,
  cloves:1, cinnamon:2, turmeric:2, groundginger:2, basildried:2, sage:2, oregano:2,
  rosemary:2, cumin:2, paprika:2, cayenne:2, blackpepper:2, nutmeg:1, garlicpowder:2, onionpowder:2,
  flaxoil:2, canolaoil:3, sunfloweroil:3, sesameoil:2, walnutoil:2, soybeanoil:3, peanutoil:3,
  cornoil:3, grapeseedoil:3, lard:3, duckfat:3, schmaltz:3,
  // USDA batch (1,500 foods): organ meats, oils and fats, spices, salty sauces
  bf_tripe:2, bf_brain:2, bf_lungs:2, bf_spleen:2, bf_thymus:2, bf_pancreas:2, tamari:2, almondoil:3, hazelnutoil:3, safflowerhioleic:3, palmoil:3, ricebranoil:3,
  cottonseedoil:3, wheatgermoil:3, codliveroil:1, turkeyfat:3, goosefat:3, baconfat:3,
  tabasco:2, sriracha:2, salsa:2, salsaverde:2,
  worcestershire:2, enchiladasauce:2, wasabi:2, allspice:2, bayleaf:2, cardamom:2,
  chilipowder:2, currypowder:2, fennelseed:2, marjoram:2, tarragon:2, caraway2:2, mustardseed:2,
  mustardoil:3, poppyseedoil:3, celeryseed:2, saffron:2, poultryseasoning:2,
  salmonoil:1, whitepepper:2, corianderseed:2, dillseed:2, fenugreek:2, mace:2,
  aniseseed:2, pumpkinpiespice:2, savory:2, saltpork:2, lambheart:2, lambkidney:2, lambtongue:2,
  turkeyliver:2, turkeyheart:2, turkeygizzard:2,
  roe_cooked:2, roe_raw:2, beefheart:2, beeftongue:2, gizzard:2, chickenheart:2, sunfloweroil_linoleic:3,
  // round 3 (whole-food additions): organ meats, oils, fish oils, dried herbs, salt
  herringoil:1, sardineoil:1, menhadenoil:1, cocoabutter:3, apricotkerneloil:3, palmkerneloil:3,
  safflowerlinoleic:3, oatoil:3, babassuoil:3, teaseedoil:3, orangepeel:2, lemonpeel:2,
  porkheart_braised:2, porkkidney_braised:2, chitterlings_simm:2, porkstomach_simm:2,
  lambbrain_fried:2, lambsweetbread:2, vealliver_braised:2, vealthymus_braised:2,
  lambtestes_fried:2, spearmint_dried:2, chervil_dried:2, corianderleaf_dried:2,
  dillweed_dried:2, parsley_dried:2, chgiblets_simmered:2, duckliver_raw:2};
const SEASONING = new Set(["iodizedsalt"]);
const countFoods = p => Object.keys(p).filter(k => !SEASONING.has(k)).length;
const DEFAULT_MAXSERV = 3;
// How many servings of one food a day plausibly holds, by category (MAXSERV still wins for
// potent foods). With a flat 3 the solver used all the room: 3 salmon fillets, 3 cups of
// quinoa, 3 avocados, 3 cups of soy milk.
const CAT_MAXSERV = {"Meat & poultry": 2, "Seafood": 2, "Grains & starches": 2, "Legumes & soy": 1.5,
  "Fruit": 2, "Vegetables": 2, "Dairy": 2, "Dairy alternatives": 2, "Eggs": 3, "Nuts & seeds": 2,
  "Other": 2};
// Meat and fish mains (organ meats are eaten by the ounce, so they don't count as one). A day
// gets at most two, one each for lunch and dinner, except under carnivore.
const isMain = k => (BY[k].cat === "Meat & poultry" || BY[k].cat === "Seafood") && !tagsOf(k).includes("organ");
const MAX_MAINS = 2;
const mainsFull = (p, diet) => diet !== "carnivore" && Object.keys(p).filter(isMain).length >= MAX_MAINS;
// While tuning portions, stay this far below each upper limit so that adding another food
// later is still possible. The final plan is still checked against the real limit.
const UL_HEADROOM = 0.88;
const ORDINARY = new Set(["potato","sweetpot","oats","egg","milk","yogurt","cheddar","chicken",
  "beef","salmon","tuna","sardine","spinach","broccoli","carrot","banana","orange","tomato",
  "brownrice","wwbread","lentil","chickpea","blackbean","almond","walnut","peanut","peas",
  "redpepper","cauliflower","mushroom","strawberry","blueberry","avocado","turkey","pork",
  "soymilk_f","almondmilk_f","oj_f"]);

let profile = {sex:"male", age:40, kcal:2500};
let plan = {};              // foodKey -> grams
let meals = {};             // foodKey -> {meal index: grams}; the grams add up to plan[foodKey]
let addMeal = 0;            // meal that newly added foods go into
let rowOrder = [];          // builder rows in display order, as "food@meal" tokens (see mealRows)
const MEALS = ["Breakfast","Lunch","Dinner","Snacks"];
let gapsFirst = true;
let DB = null;

