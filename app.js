(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, v) { const el = $(id); if (el) el.textContent = v; }

  // ---------- Formatting ----------
  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyPerCwt(x) { return isFinite(x) ? `${money(x)} /cwt` : "—"; }
  function moneyPerHd(x) { return isFinite(x) ? `${money(x)} /hd` : "—"; }
  function pct(x) { return isFinite(x) ? (x * 100).toFixed(2) + "%" : "—"; }
  function fmtNum(x, d=2) { return isFinite(x) ? Number(x).toFixed(d) : "—"; }

  // ---------- Parsing ----------
  function numOrNaNFromTextInput(id) {
    const raw = String($(id)?.dataset?.value ?? $(id)?.value ?? "").trim();
    if (raw === "" || raw === "—") return NaN;
    const v = Number(raw);
    return isFinite(v) ? v : NaN;
  }
  function numOrNaN(id) {
    const raw = String($(id)?.value ?? "").trim();
    if (raw === "") return NaN;
    const v = Number(raw);
    return isFinite(v) ? v : NaN;
  }
  function parseDateOrNull(id) {
    const s = String($(id)?.value || "").trim();
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, days) {
    const out = new Date(d);
    out.setDate(out.getDate() + Number(days));
    return out;
  }

  function clearError() { setText("errorText", ""); }
  function softError(msg) { setText("errorText", msg || ""); }

  // ---------- Status coloring ----------
  // GOOD >= +$50/hd, MID -$25 to +$50, BAD < -$25
  function applyStatus(plPerHd) {
    const tiles = [$("tilePlPerCwt"), $("tilePlPerHd"), $("tileTotalPL")].filter(Boolean);
    tiles.forEach(t => t.classList.remove("good","mid","bad"));
    if (!isFinite(plPerHd)) return;
    const cls = (plPerHd >= 50) ? "good" : (plPerHd >= -25 ? "mid" : "bad");
    tiles.forEach(t => t.classList.add(cls));
  }

  // ---------- Picker Modal ----------
  const overlay = $("pickerOverlay");
  const wheel = $("pickerWheel");
  const titleEl = $("pickerTitle");
  const btnCancel = $("pickerCancel");
  const btnDone = $("pickerDone");

  let pickerState = null; // { inputEl, title, values:[{label,value}], selectedIndex }

  function buildWheel(values, selectedIndex) {
    wheel.innerHTML = "";
    const frag = document.createDocumentFragment();
    values.forEach((v, i) => {
      const div = document.createElement("div");
      div.className = "wheelItem";
      div.dataset.index = String(i);
      div.textContent = v.label;
      frag.appendChild(div);
    });
    wheel.appendChild(frag);

    // position wheel to selected
    requestAnimationFrame(() => {
      const items = wheel.querySelectorAll(".wheelItem");
      const target = items[selectedIndex];
      if (target) target.scrollIntoView({ block: "center" });
      markActive();
    });
  }

  function markActive() {
    const items = wheel.querySelectorAll(".wheelItem");
    if (!items.length) return;

    // find the item closest to center
    const rect = wheel.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;

    let bestIdx = 0;
    let bestDist = Infinity;

    items.forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const d = Math.abs(y - centerY);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });

    items.forEach(el => el.classList.remove("active"));
    if (items[bestIdx]) items[bestIdx].classList.add("active");

    if (pickerState) pickerState.selectedIndex = bestIdx;
  }

  let scrollTimer = null;
  wheel.addEventListener("scroll", () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => markActive(), 60);
  }, { passive: true });

  function openPicker(inputEl, cfg) {
    const { title, values, defaultValue } = cfg;

    // determine current selection
    let current = inputEl.dataset.value;
    if (current === undefined || current === "" || current === "—") current = String(defaultValue);

    let selectedIndex = values.findIndex(v => String(v.value) === String(current));
    if (selectedIndex < 0) selectedIndex = 0;

    pickerState = { inputEl, title, values, selectedIndex };

    titleEl.textContent = title;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    buildWheel(values, selectedIndex);
  }

  function closePicker() {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    wheel.innerHTML = "";
    pickerState = null;
  }

  btnCancel.addEventListener("click", closePicker);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePicker();
  });

  btnDone.addEventListener("click", () => {
    if (!pickerState) return;

    const chosen = pickerState.values[pickerState.selectedIndex];
    const inputEl = pickerState.inputEl;

    inputEl.value = chosen.label;
    inputEl.dataset.value = String(chosen.value);

    closePicker();
    updateAll();
  });

  // ---------- Picker data builders ----------
  function rangeValues({ start, end, step, decimals, suffix = "" }) {
    const vals = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
      const v = start + i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) + suffix });
    }
    return vals;
  }

  function rangeValuesDesc({ start, end, step, decimals, suffix = "" }) {
    const vals = [];
    const n = Math.round((start - end) / step);
    for (let i = 0; i <= n; i++) {
      const v = start - i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) + suffix });
    }
    return vals;
  }

  // ---------- Derived displays ----------
  function updateHeadOwnedOnly() {
    const totalHead = numOrNaN("totalHead");
    const ownershipPct = numOrNaN("ownershipPct");
    const headOwnedEl = $("headOwned");
    if (!headOwnedEl) return;

    if (isFinite(totalHead) && totalHead > 0 && isFinite(ownershipPct) && ownershipPct > 0) {
      const myHead = totalHead * (ownershipPct / 100.0);
      headOwnedEl.value = myHead.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } else {
      headOwnedEl.value = "—";
    }
  }

  function updateADGOnly() {
    const daysOnFeed = numOrNaN("daysOnFeed");
    const inWeight = numOrNaN("inWeight");
    const outWeight = numOrNaN("outWeight");
    const adgEl = $("adg");
    if (!adgEl) return;

    if (isFinite(daysOnFeed) && daysOnFeed > 0 && isFinite(inWeight) && isFinite(outWeight) && outWeight > inWeight) {
      adgEl.value = fmtNum((outWeight - inWeight) / daysOnFeed, 2);
    } else {
      adgEl.value = "—";
    }
  }

  function updateOutDateInline() {
    const inDate = parseDateOrNull("inDate");
    const daysOnFeed = numOrNaN("daysOnFeed");
    const outEl = $("outDateInline");

    if (inDate && isFinite(daysOnFeed) && daysOnFeed > 0) {
      const outDate = addDays(inDate, daysOnFeed);
      outEl.value = outDate.toLocaleDateString();
      return outDate;
    }
    outEl.value = "—";
    return null;
  }

  // ---------- Outputs reset ----------
  function resetOutputs() {
    setText("plPerHd","—");
    setText("projectedTotalPL","—");
    setText("plPerCwt","—");
    setText("breakEvenCwt","—");
    setText("salesPrice","—");
    setText("capitalInvested","—");
    setText("cattleSales","—");
    setText("roe","—");
    setText("annualRoe","—");
    setText("irr","—");

    setText("d_myHead","—");
    setText("d_costPerHd","—");
    setText("d_deadLossDollars","—");
    setText("d_feedCost","—");
    setText("d_perHdCOG","—");
    setText("d_interestPerHd","—");
    setText("d_totalCostPerHd","—");
    setText("d_salesPerHd","—");
    setText("d_equityBase","—");
  }

  // ---------- IRR (two-point) ----------
  function irrTwoPoint(c0, c1, d0, d1) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const t = (d1 - d0) / msPerDay / 365.0;
    if (!(t > 0)) return NaN;
    const ratio = -c1 / c0;
    if (ratio > 0) return Math.pow(ratio, 1 / t) - 1;
    return NaN;
  }

  // ---------- Main calc ----------
  function updateAll() {
    clearError();

    updateHeadOwnedOnly();
    updateADGOnly();
    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateInline();

    // Equity fixed 30%
    const equityUsed = 0.30;

    // Read picker values from dataset.value (numeric)
    const interestRatePct = numOrNaNFromTextInput("interestRatePct");
    const cogNoInterest = numOrNaNFromTextInput("cogNoInterest");
    const deathLossPct = numOrNaNFromTextInput("deathLossPct");
    const basis = numOrNaNFromTextInput("basis");

    // Standard inputs
    const daysOnFeed = numOrNaN("daysOnFeed");
    const totalHead = numOrNaN("totalHead");
    const ownership = numOrNaN("ownershipPct") / 100.0;

    const inWeight = numOrNaN("inWeight");
    const priceCwt = numOrNaN("priceCwt");
    const outWeight = numOrNaN("outWeight");
    const futures = numOrNaN("futures");

    // Guardrails
    if (isFinite(daysOnFeed) && daysOnFeed < 0) {
      softError("Days on Feed must be > 0.");
      resetOutputs(); applyStatus(NaN);
      return;
    }
    if (isFinite(inWeight) && isFinite(outWeight) && inWeight > 0 && outWeight > 0 && outWeight <= inWeight) {
      softError("Out Weight must be greater than In Weight.");
      resetOutputs(); applyStatus(NaN);
      return;
    }

    // Core prerequisites
    const haveCore =
      isFinite(daysOnFeed) && daysOnFeed > 0 &&
      isFinite(interestRatePct) &&
      isFinite(deathLossPct) &&
      isFinite(inWeight) && inWeight > 0 &&
      isFinite(priceCwt) &&
      isFinite(outWeight) && outWeight > 0 &&
      isFinite(cogNoInterest);

    if (!haveCore) {
      resetOutputs();
      // still show sales price if futures+basis are present
      if (isFinite(futures) && isFinite(basis)) setText("salesPrice", moneyPerCwt(futures + basis));
      applyStatus(NaN);
      return;
    }

    const interestRate = interestRatePct / 100.0;
    const deathLoss = deathLossPct / 100.0;

    const gained = outWeight - inWeight;

    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deadLossDollars = deathLoss * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    const interestPerHd =
      (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

    const totalCostPerHd = costPerHd + perHdCOG + interestPerHd;
    const breakEvenCwt = (totalCostPerHd / outWeight) * 100.0;

    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));

    // details
    setText("d_costPerHd", money(costPerHd));
    setText("d_deadLossDollars", money(deadLossDollars));
    setText("d_feedCost", money(feedCost));
    setText("d_perHdCOG", money(perHdCOG));
    setText("d_interestPerHd", money(interestPerHd));
    setText("d_totalCostPerHd", money(totalCostPerHd));

    // Sales side
    if (!(isFinite(futures) && isFinite(basis))) {
      setText("salesPrice", "—");
      setText("plPerCwt", "—");
      setText("plPerHd", "—");
      setText("projectedTotalPL", "—");
      setText("capitalInvested", "—");
      setText("cattleSales", "—");
      setText("roe", "—");
      setText("annualRoe", "—");
      setText("irr", "—");
      setText("d_salesPerHd", "—");
      setText("d_equityBase", "—");
      setText("d_myHead", "—");
      applyStatus(NaN);
      return;
    }

    const salesPrice = futures + basis;
    const plPerCwt = salesPrice - breakEvenCwt;
    const plPerHd = (plPerCwt * outWeight) / 100.0;

    setText("salesPrice", moneyPerCwt(salesPrice));
    setText("plPerCwt", moneyPerCwt(plPerCwt));
    setText("plPerHd", moneyPerHd(plPerHd));

    const salesPerHd = (salesPrice * outWeight) / 100.0;
    setText("d_salesPerHd", money(salesPerHd));

    // Totals
    const haveTotals = isFinite(totalHead) && totalHead > 0 && isFinite(ownership) && ownership > 0;
    if (!haveTotals) {
      setText("projectedTotalPL", "—");
      setText("capitalInvested", "—");
      setText("cattleSales", "—");
      setText("roe", "—");
      setText("annualRoe", "—");
      setText("irr", "—");
      setText("d_equityBase", "—");
      setText("d_myHead", "—");
      applyStatus(plPerHd);
      return;
    }

    const myHead = totalHead * ownership;
    setText("d_myHead", myHead.toLocaleString(undefined, { maximumFractionDigits: 2 }));

    const capitalInvested = totalCostPerHd * myHead;
    const cattleSales = salesPerHd * myHead;
    const projectedTotalPL = plPerHd * myHead;

    setText("capitalInvested", money(capitalInvested));
    setText("cattleSales", money(cattleSales));
    setText("projectedTotalPL", money(projectedTotalPL));

    const equityBase = capitalInvested * equityUsed;
    setText("d_equityBase", money(equityBase));

    const roe = (equityBase !== 0) ? (projectedTotalPL / equityBase) : NaN;
    setText("roe", pct(roe));

    const years = daysOnFeed / 365.0;
    const annualRoe = (isFinite(roe) && years > 0) ? (Math.pow(1 + roe, 1 / years) - 1) : NaN;
    setText("annualRoe", pct(annualRoe));

    if (inDate && outDate) {
      const irr = irrTwoPoint(-capitalInvested, cattleSales, inDate, outDate);
      setText("irr", pct(irr));
    } else {
      setText("irr", "—");
    }

    applyStatus(plPerHd);
  }

  // ---------- Wiring + defaults ----------
  function setPickerDefault(inputId, label, value) {
    const el = $(inputId);
    el.value = label;
    el.dataset.value = String(value);
  }

  function attachPicker(inputId, cfg) {
    const el = $(inputId);
    el.addEventListener("click", () => openPicker(el, cfg));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(el, cfg); }
    });
  }

  function resetAll() {
    // standard inputs
    ["daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures"].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    // defaults
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth()+1).padStart(2,"0");
    const dd = String(t.getDate()).padStart(2,"0");
    if ($("inDate")) $("inDate").value = `${yyyy}-${mm}-${dd}`;
    if ($("ownershipPct")) $("ownershipPct").value = "100";

    // picker defaults
    setPickerDefault("pickYear", String(yyyy), yyyy);
    setPickerDefault("interestRatePct", "7.25", 7.25);
    setPickerDefault("cogNoInterest", "1.10", 1.10);
    setPickerDefault("deathLossPct", "1.0", 1.0);
    setPickerDefault("basis", "0.0", 0.0);

    // derived display
    if ($("adg")) $("adg").value = "—";
    if ($("headOwned")) $("headOwned").value = "—";
    if ($("outDateInline")) $("outDateInline").value = "—";

    clearError();
    resetOutputs();
    applyStatus(NaN);
    updateAll();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // date default
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth()+1).padStart(2,"0");
    const dd = String(t.getDate()).padStart(2,"0");
    if ($("inDate") && !$("inDate").value) $("inDate").value = `${yyyy}-${mm}-${dd}`;
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";

    // picker value lists
    const yearVals = [];
    for (let y = 2020; y <= 2035; y++) yearVals.push({ value: y, label: String(y) });

    const cogVals = rangeValues({ start: 0.75, end: 1.50, step: 0.01, decimals: 2, suffix: "" });
    const dlVals  = rangeValues({ start: 0.0,  end: 100.0, step: 0.5,  decimals: 1, suffix: "" });
    // Interest: 0.00 -> 25.00 by 0.01 (wheel-size, but manageable)
    const irVals  = rangeValues({ start: 0.00, end: 25.00, step: 0.01, decimals: 2, suffix: "" });
    // Basis: +100 down to -100 by 0.5 (per your earlier “start +100 down to -100”)
    const basisVals = rangeValuesDesc({ start: 100.0, end: -100.0, step: 0.5, decimals: 1, suffix: "" });

    // defaults (if missing)
    if (!$("pickYear").dataset.value) setPickerDefault("pickYear", String(yyyy), yyyy);
    if (!$("interestRatePct").dataset.value) setPickerDefault("interestRatePct", "7.25", 7.25);
    if (!$("cogNoInterest").dataset.value) setPickerDefault("cogNoInterest", "1.10", 1.10);
    if (!$("deathLossPct").dataset.value) setPickerDefault("deathLossPct", "1.0", 1.0);
    if (!$("basis").dataset.value) setPickerDefault("basis", "0.0", 0.0);

    // attach pickers
    attachPicker("pickYear",        { title: "Year", values: yearVals, defaultValue: yyyy });
    attachPicker("cogNoInterest",   { title: "Projected COG", values: cogVals, defaultValue: 1.10 });
    attachPicker("deathLossPct",    { title: "Death Loss (%)", values: dlVals, defaultValue: 1.0 });
    attachPicker("interestRatePct", { title: "Interest Rate (%)", values: irVals, defaultValue: 7.25 });
    attachPicker("basis",           { title: "Expected Basis", values: basisVals, defaultValue: 0.0 });

    // bind normal inputs
    const ids = ["inDate","daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures"];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", updateAll);
      el.addEventListener("change", updateAll);
    });

    $("resetBtn")?.addEventListener("click", resetAll);

    updateAll();
  });

  // helper to build ranges
  function rangeValues({ start, end, step, decimals, suffix = "" }) {
    const vals = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
      const v = start + i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) + suffix });
    }
    return vals;
  }

  function rangeValuesDesc({ start, end, step, decimals, suffix = "" }) {
    const vals = [];
    const n = Math.round((start - end) / step);
    for (let i = 0; i <= n; i++) {
      const v = start - i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) + suffix });
    }
    return vals;
  }
})();
