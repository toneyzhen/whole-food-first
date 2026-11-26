# CLAUDE.md — working on Whole Food First

The app was called The Complete Day until 2026-11. The repo and Pages URL were renamed to
`whole-food-first` (2026-11-24); links to the old `/the-complete-day/` address stopped working then.
The `localStorage` keys (`completeday`, `completeday-foods`) and the backup id (`the-complete-day`)
keep the old name on purpose: changing them would wipe saved data and reject older backups.
(localStorage belongs to the origin, toneyzhen.github.io, so the rename kept everyone's data.)

Context for Claude Code sessions. Read README.md for what the app does; this file covers how to
change it without breaking its rules.

## Layout and workflow

- `src/app.template.html` — the page: HTML and CSS, with `/*__JS__*/` where the scripts go.
- `src/js/*.js` — the app's vanilla JS (no framework, no build deps), by area: `foods` (data,
  your own foods, RENAMED/REMOVED, caps), `nutrients` (targets, explainers, coverage panel and
  whole-food score), `builder` (plan list, meals, search, editing), `solver` (suggestions,
  solveDay and its steps), `views` (ranking, tabs, profile), `storage` (saving, your own foods
  form, share links and backups), `boot` (startup). `build.py` concatenates them in the order of
  its `JS_FILES` into one `<script>`: they share one scope and run top to bottom, so a file may
  use anything defined in an earlier one. Keep new code in the file of its area, and add a file
  to `JS_FILES` in the right place if a new area appears.
- `data/foods.json` — the database: `order` (32 nutrient keys), `meta` (labels/units/notes),
  `foods` (each: `k` key, `name`, `cat`, `cls` plant|dairy|egg|fish|meat, `serv` grams per
  serving, `sl` serving label, `tags` space-separated, `raw` 0|1, `n` values in `order`, per
  100 g, `common` 1 for an everyday food or 0 for an uncommon one, `nova` its NOVA processing
  group 1-3, `exc` the stated reason on a group-4 food kept on purpose, and `fdc`, the USDA
  FoodData Central ID, wherever the values came from one SR Legacy entry, and `ff`, the Foundation
  Foods ID, where newer Foundation values replaced some of them), `removed` (key ->
  name of the ultra-processed foods taken out), `dri` targets by `sex:age`, `ul` upper limits,
  `softUl` advisory limits. No two foods may share an `fdc`:
  that is how duplicates of a hand-corrected older food were caught.
- `index.html` — generated. Never edit it by hand; edit src/ or data/ and rebuild. Commit it
  (it is what users open and what GitHub Pages would serve).

After any change:
```
python3 scripts/validate.py && python3 build.py && node tests/smoke.js
```
The smoke test needs Playwright (CI installs it; see `.github/workflows/ci.yml`). Calories count
toward the 27, as in the builder. Expected results at 14 foods: 27/27 at 100–102% kcal using 8–12
foods for every pattern except carnivore (~20: no route to fiber, and it leans on organ meats),
and at most one uncommon food in each of those days (carnivore excepted). Any `OVER` line, or calories
above 105%, fails. It also sweeps every bias ×
pattern at 14 and 7 foods for three profiles and fails on any upper-limit breach, any portion past
`capOf`, or a third meat/fish main; that sweep is what caught the rounding bugs, so extend it
rather than trim it. Unit checks cover name cleaning, food validation, `knownOnly` (including
inherited names like `toString` from share links), the share-link encoding and meal moves.

## Data rules (do not relax these)

- Values are per 100 g of the food *as named* ("cooked" means cooked values, not raw ones).
- Reference: USDA FoodData Central, SR Legacy first, with Foundation Foods values taken nutrient by
  nutrient where the same food and form exists (`ff`; every change logged in
  `data/audit/foundation_2026-04.json`; never a Foundation 0 over a real SR value). To refresh from
  a new Foundation release, run `scripts/foundation.py <release zip>` (matches live in
  `data/audit/foundation_matches.json`);
  iodine from the USDA/FDA/ODS Iodine Database;
  fortified products from their Nutrition Facts panel (convert %DV using the 2016 FDA DVs).
- **Unknown trace nutrients = 0, never guessed.** Under-crediting is the safe direction.
- **Sodium is always filled in** (it is a ceiling; a blank would err unsafely).
- Units: vitamin A mcg RAE (not IU), D mcg (40 IU = 1 mcg), E mg alpha-tocopherol,
  folate mcg DFE, K1K2 = vitamin K1 + K2 combined, EPADHA/LA/ALA in grams.
- Every food must pass `scripts/validate.py` (Atwater energy cross-check, fiber ≤ carb, no
  fiber in animal foods, no B12 in unfortified plants).
- Tags drive diet rules and exclusions: dairy egg gluten peanut treenut soy fish shellfish sesame
  nightshade legume grain redmeat organ addedsugar fortified. Coconut is tagged treenut (FDA).
  Anything fortified or enriched gets `fortified`.
- **Whole and minimally processed food only.** Every food has a NOVA group: 1 unprocessed or
  minimally processed, 2 processed culinary ingredient, 3 processed. Don't add ultra-processed
  foods (group 4). The only group-4 foods are the fortified soy and almond milks, kept as the
  vegan food route to B12, each with its reason in `exc`; add another only with a nutrient a
  pattern can't reach otherwise, and say so in `exc`. Label a food as typically sold in a US
  supermarket; plain breads are 3; added vitamins alone don't make a food 4.
- Potent foods get a serving cap in `MAXSERV` in the template (livers, salt, spices, oils…);
  everything else is capped by category in `CAT_MAXSERV` (about two servings).
- When adding foods, cite where the numbers came from in the commit message. When checking data,
  follow `data/audit/REVIEW_INSTRUCTIONS.md`.

## App conventions

- Amounts are stored in **grams** in the plan object; the builder displays and edits **servings**
  (decimals allowed). The builder's row order is `rowOrder` (below), not `plan`'s key order;
  reordering `plan` keys changes nothing on screen.
- `plan[k]` is a food's total for the day; `meals[k]` splits it by meal (`{"0": 40, "1": 80}`
  grams), so one food can sit in several meals. Change a meal's portion only through `setPortion`,
  which keeps `plan[k]` equal to the sum. `fillMeals` normalises any input (older data stored a
  single meal index; mismatched sums are scaled) and guesses a meal for foods without one, so
  solver plans need no meal data. Each builder row is one `food@meal` token; drag and arrow keys
  both edit the token list (`mealTokens`/`applyTokens`), and a row moved into a meal that already
  has that food merges into it. Row order lives in `rowOrder` (those tokens), not in `plan`'s key
  order: a food in two meals has one place in `plan`, which pinned it to the top of the later
  meal. `rowOrder` travels with the current day, saved days, share links and backups (`order`).
- Your own foods (`custom: true`, keys `c-…`) live in `localStorage` key `completeday-foods` and are
  merged into `FOODS`/`BY` at startup. Their names pass through `cleanText` (no markup characters),
  since food names are interpolated into HTML everywhere. Any plan loaded from storage goes
  through `knownOnly`, because it may name a custom food this browser doesn't have.
- Food keys are permanent: saved days, share links and backups refer to them. To remove a food,
  either map its key to its replacement in `RENAMED` (`knownOnly`, `cleanMeals` and `cleanOrder`
  follow it, and the smoke test checks every target exists), or, when nothing replaces it, list it
  under `removed` in foods.json so a day that used it names what was left out (`noteRemoved`).
- Share links (`#day=` + base64url JSON) and backup files are untrusted: they only enter through
  `importFoods` (normCustom), `knownOnly` and `cleanMeals`. A shared day never replaces the
  current one without the user pressing "Open it"; a restore only ever adds.
- Several tabs share that storage. A `storage` listener picks up another tab's saved days in place
  and reloads when your own foods change; never make startup write `completeday-foods`, or two
  open tabs will reload each other forever.
- 27 targets (`TARGETS`) = 26 counted nutrients + calories. Informational only (never a gap):
  molybdenum (USDA doesn't measure it, so most foods read 0; its UL still applies), EPA+DHA, fat,
  carb, sodium. Manganese's UL is advisory. The vitamin A UL counts preformed A only.
- The current day, profile and chip settings persist in `localStorage` (key `completeday`).
  Saved days use the `window.claude` db when hosted as a claude.ai artifact; standalone they go
  in the same `localStorage` entry (`saved`, ids prefixed `local-`). Saved-day names are user
  input (and shared across viewers in the artifact db): always render them through `esc()`.
- Keep it one self-contained file: no external scripts; Google Fonts is the only external request.
- Recent foods (`recent`, builder.js) are recorded in `addFood`, which every add path uses, and
  stored with the current day; stored keys pass through `cleanRecent`.
- Phones: touch-only sizing lives in one `@media (pointer:coarse)` block (finger-sized targets,
  16 px inputs so iOS doesn't zoom). On narrow screens `.split` must stay `minmax(0,1fr)`: a plain
  `1fr` grows to fit unbreakable content (a one-line chip row once made the page 1,200 px wide).
  smoke.js opens a 375 px touch page and fails if it scrolls sideways or an input is under 16 px.
- Light and dark themes are CSS custom properties on `:root`; keep both working, and keep the
  layout usable at 390 px wide with no horizontal scroll.

## Open tasks (good starting points)

1. Solver pipeline after the main loop: `tune` → `trimKcal` → `swapLeaner` (only on days over
   104% kcal; fixed search size so results are deterministic) → `topUp` → `roundPortions`.
   About 3% of days (8 of the 288 in the sweep) still land above 105% kcal, mostly at
   1,400–1,600 kcal targets.
2. `suggest` discounts a food by how much of the room left under each upper limit it would use
   (exponent 1.5, tuned on the 288-day sweep). Current sweep (2026-11-25): fully met 126 at 14 foods
   and 50 at 7, 0 days under 90% kcal, 8 over 105%, 0 limit/portion/mains problems. Without it, fortified cereals used up the iron room and vegan days
   stalled near 60% kcal. Check those sweep numbers again after adding foods.
3. Top-up picks the most energy-dense ordinary staple; it could choose by nutrient fit instead.
4. Search ranking (`searchRank` in builder.js) is hand-tuned on common queries (rice, chicken,
   beef, beans, salmon, tuna); smoke.js checks one. Re-check a few after adding many foods.
5. `UNCOMMON_WEIGHT` (0.5) scales an uncommon food's score in `suggest`. Sweep, 1.0 vs 0.5:
   uncommon foods per day 3.1 -> 0.3, fully met at 14 foods 125 -> 126, at 7 foods 48 -> 40,
   days over 105% kcal 8 -> 10. 0.4 and 0.3 cost carnivore organ meats (21-23/28).
6. Iodine: the Iodine Database (Release 4.0) is applied by its SR link, then by name for the
   same food and form; only foods that read 0 were filled. Breads carry iodine from dough
   conditioners, so vegan days may lean on breadcrumbs for it.

The app is published with GitHub Pages from `main` (https://toneyzhen.github.io/whole-food-first/),
so every push to `main` goes live; commit a rebuilt `index.html` with every src/data change.

## Working with Toney (the owner)

- When he asks a question ("K1 vs K2?", "should I add soy milk?"), answer it. Don't change the app
  unless he asks for a change.
- "Don't update the app, just show me the table" means compute offline and report; no edits.
- He prefers concise answers and real numbers over hedging. Flag data uncertainty plainly.
- This is a public repo: never commit personal details (email addresses, his personal diet plan).
  Commits use his GitHub no-reply address and carry a `Co-Authored-By: Claude` trailer.
- Not medical advice; keep the disclaimer in the README and footer.
