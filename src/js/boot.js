/* ---------------- boot ---------------- */
const addMealSel = document.getElementById("addmeal");
addMealSel.innerHTML = MEALS.map((m, i) => `<option value="${i}">Add to ${m.toLowerCase()}</option>`).join("");
addMealSel.addEventListener("change", () => { addMeal = +addMealSel.value; persistLocal(); });
restoreLocal();
addMealSel.value = String(addMeal);
renderCustomList();
AVOIDABLE.forEach(([t]) => {
  const c = document.querySelector(`[data-avoid="${t}"]`);
  if (c) c.setAttribute("aria-pressed", String(avoid.has(t)));
});
GROUPS.forEach(g => {
  const c = document.querySelector(`[data-sugoff="${g}"]`);
  if (c) c.setAttribute("aria-pressed", String(sugOff.has(g)));
});
if (!Object.keys(plan).length){
  // open in a realistic working state rather than an empty shell
  plan = {oats:60, milk:240, egg:100, spinach:150, salmon:113, sweetpot:200, almond:28, lentil:150};
}
renderPlan();
showTab("build");
initDb();
// A shared day never replaces today's without asking.
const shared = readShared();
if (shared){
  // count foods this browser knows or the link brings along (its own foods aren't imported yet)
  const brought = new Set((Array.isArray(shared.foods) ? shared.foods : []).map(normCustom).filter(Boolean).map(f => f.k));
  const n = Object.keys(shared.plan && typeof shared.plan === "object" ? shared.plan : {})
    .filter(k => Object.prototype.hasOwnProperty.call(BY, k) || brought.has(k)).length;
  const box = document.getElementById("sharein"), gone = removedNames(shared.plan);
  document.getElementById("shareintext").textContent = n
    ? `Someone shared a day with ${n} food${n === 1 ? "" : "s"}. Opening it replaces your current day; save yours first if you want to keep it.`
    : gone.length ? `This link has a shared day, but its foods are ultra-processed (NOVA group 4) and no longer in the app: ${gone.join(", ")}.`
    : "This link has a shared day, but none of its foods could be read.";
  document.getElementById("sharein-open").hidden = !n;
  box.hidden = false;
  document.getElementById("sharein-open").addEventListener("click", () => {
    importFoods(shared.foods);
    plan = knownOnly(shared.plan); meals = cleanMeals(shared.meals); rowOrder = cleanOrder(shared.order);
    noteRemoved(shared.plan); renderPlan(); box.hidden = true; dropHash();
  });
  document.getElementById("sharein-ignore").addEventListener("click", () => { box.hidden = true; dropHash(); });
}
// Each tab holds saved days and your own foods in memory and writes its whole copy back, so
// without this a second open tab erases what the first one saved. Saved days are picked up in
// place (no write, so two tabs can't ping-pong); a change to your own foods, or a cleared
// storage, reloads to rebuild the food index. The current day itself stays last-writer-wins.
addEventListener("storage", e => {
  if (e.key === CUSTOM_KEY || e.key === null){ location.reload(); return; }
  if (e.key !== "completeday") return;
  try {
    const s = JSON.parse(e.newValue || "null");
    savedCache = savedCache.filter(x => !x.id.startsWith("local-"))
      .concat(s && Array.isArray(s.saved) ? s.saved : []);
    renderSaved(savedCache);
  } catch (err) {}
});
