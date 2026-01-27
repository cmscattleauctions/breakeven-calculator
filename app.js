(function () {
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  // ====== State ======
  let quickRun = false;

  // ====== Format helpers ======
  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const moneyPerCwt = (x) => isFinite(x) ? `${money(x)} /cwt` : "—";
  const moneyPerHd  = (x) => isFinite(x) ? `${money(x)} /hd` : "—";
  const pct         = (x) => isFinite(x) ? (x * 100).toFixed(2) + "%" : "—";
  const fmtNum      = (x, d=2) => isFinite(x) ? Number(x).toFixed(d) : "—";

  // ====== Parse helpers ======
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

  function clearError(){ setText("errorText",""); }
  function softError(msg){ setText("errorText", msg || ""); }

  // ====== Status coloring ======
  function applyStatus(plPerHd){
    const tiles = [$("tilePlPerCwt"), $("tilePlPerHd"), $("tileTotalPL")].filter(Boolean);
    tiles.forEach(t => t.classList.remove("good","mid","bad"));
    if (!isFinite(plPerHd)) return;
    const cls = (plPerHd >= 50) ? "good" : (plPerHd >= -25 ? "mid" : "bad");
    tiles.forEach(t => t.classList.add(cls));
  }

  // ====== Derived displays ======
  function updateHeadOwned(){
    const totalHead = numOrNaN("totalHead");
    const ownershipPct = numOrNaN("ownershipPct");
    const el = $("headOwned");
    if (!el) return;

    if (!quickRun && isFinite(totalHead) && totalHead > 0 && isFinite(ownershipPct) && ownershipPct >= 0) {
      const myHead = totalHead * (ownershipPct / 100.0);
      el.value = myHead.toLocaleString(undefined, { maximumFractionDigits: 2 });
      setText("d_myHead", el.value);
    } else {
      el.value = "—";
      setText("d_myHead", "—");
    }
  }

  function updateADG(){
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

  function updateOutDateInline(){
    const inDate = parseDateOrNull("inDate");
    const daysOnFeed = numOrNaN("daysOnFeed");
    const outEl = $("outDateInline");
    if (!outEl) return null;

    if (inDate && isFinite(daysOnFeed) && daysOnFeed > 0) {
      const outDate = addDays(inDate, daysOnFeed);
      outEl.value = outDate.toLocaleDateString();
      return outDate;
    }
    outEl.value = "—";
    return null;
  }

  // ====== Outputs reset ======
  function resetOutputs(){
    ["plPerHd","projectedTotalPL","plPerCwt","breakEvenCwt","salesPrice",
     "capitalInvested","cattleSales","roe","annualRoe","irr",
     "d_costPerHd","d_deadLossDollars","d_feedCost","d_perHdCOG","d_interestPerHd",
     "d_totalCostPerHd","d_salesPerHd","d_equityBase"
    ].forEach(id => setText(id, "—"));
  }

  // ====== IRR (two-point) ======
  function irrTwoPoint(c0, c1, d0, d1) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const t = (d1 - d0) / msPerDay / 365.0;
    if (!(t > 0)) return NaN;
    const ratio = -c1 / c0;
    if (ratio > 0) return Math.pow(ratio, 1 / t) - 1;
    return NaN;
  }

  // ====== Quick Run UI toggle ======
  function applyQuickRunUI(){
    $("quickRunBtn").textContent = `Quick Run: ${quickRun ? "ON" : "OFF"}`;

    // Hide inputs
    $("wrapTotalHead").classList.toggle("hidden", quickRun);
    $("wrapOwnershipPct").classList.toggle("hidden", quickRun);
    $("wrapInterestRate").classList.toggle("hidden", quickRun);
    $("wrapHeadOwned").classList.toggle("hidden", quickRun);

    // Hide results tiles
    const hide = (id, shouldHide) => { const el = $(id); if (el) el.classList.toggle("hidden", shouldHide); };

    // In quick run, only show P/L per head and P/L per cwt
    hide("tileTotalPL", quickRun);
    hide("tileBreakEven", quickRun);
    hide("tileSalesPrice", quickRun);
    hide("tileCapitalInvested", quickRun);
    hide("tileCattleSales", quickRun);
    hide("tileRoe", quickRun);
    hide("tileAnnualRoe", quickRun);
    hide("tileIrr", quickRun);
    $("detailsPanel").classList.toggle("hidden", quickRun);

    // Also remove Total PL color tile effect if hidden (fine either way)
  }

  // ====== Main calc ======
  function updateAll(){
    clearError();
    updateHeadOwned();
    updateADG();
    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateInline();

    // Equity fixed 30% (not used in Quick Run results, but fine)
    const equityUsed = 0.30;

    // Inputs
    const daysOnFeed = numOrNaN("daysOnFeed");

    // Interest:
    // - Normal mode: use entered interest
    // - Quick Run: ignore interest (treat as 0)
    const interestRatePctRaw = numOrNaN("interestRatePct");
    const interestRatePct = quickRun ? 0 : interestRatePctRaw;
    const interestRate = interestRatePct / 100.0;

    const totalHead = numOrNaN("totalHead");
    const ownership = numOrNaN("ownershipPct") / 100.0;

    const inWeight = numOrNaN("inWeight");
    const priceCwt = numOrNaN("priceCwt");
    const outWeight = numOrNaN("outWeight");

    const cogNoInterest = numOrNaN("cogNoInterest");
    const deathLossPct = numOrNaN("deathLossPct");
    const deathLoss = deathLossPct / 100.0;

    const futures = numOrNaN("futures");
    const basis = numOrNaN("basis");

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

    const haveCore =
      isFinite(daysOnFeed) && daysOnFeed > 0 &&
      isFinite(interestRate) && interestRate >= 0 &&
      isFinite(deathLoss) && deathLoss >= 0 &&
      isFinite(inWeight) && inWeight > 0 &&
      isFinite(priceCwt) &&
      isFinite(outWeight) && outWeight > 0 &&
      isFinite(cogNoInterest);

    if (!haveCore) {
      resetOutputs();
      if (isFinite(futures) && isFinite(basis)) setText("salesPrice", moneyPerCwt(futures + basis));
      applyStatus(NaN);
      return;
    }

    const gained = outWeight - inWeight;

    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deadLossDollars = deathLoss * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    // Interest per hd (0 in Quick Run)
    const interestPerHd =
      (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

    const totalCostPerHd = costPerHd + perHdCOG + interestPerHd;
    const breakEvenCwt = (totalCostPerHd / outWeight) * 100.0;

    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));

    setText("d_costPerHd", money(costPerHd));
    setText("d_deadLossDollars", money(deadLossDollars));
    setText("d_feedCost", money(feedCost));
    setText("d_perHdCOG", money(perHdCOG));
    setText("d_interestPerHd", money(interestPerHd));
    setText("d_totalCostPerHd", money(totalCostPerHd));

    // Sales side
    if (!(isFinite(futures) && isFinite(basis))) {
      setText("salesPrice","—");
      setText("plPerCwt","—");
      setText("plPerHd","—");

      // In Quick Run, that’s basically all we show
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_salesPerHd","—");
      setText("d_equityBase","—");
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

    // If Quick Run: stop here (no totals, no ROE, no IRR)
    if (quickRun) {
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_equityBase","—");
      applyStatus(plPerHd);
      return;
    }

    // Totals (normal mode)
    const haveTotals = isFinite(totalHead) && totalHead > 0 && isFinite(ownership) && ownership > 0;
    if (!haveTotals) {
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_equityBase","—");
      applyStatus(plPerHd);
      return;
    }

    const myHead = totalHead * ownership;

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
      setText("irr","—");
    }

    applyStatus(plPerHd);
  }

  // ================== Mobile wheel picker (phones only) ==================
  const overlay = $("pickerOverlay");
  const wheel = $("pickerWheel");
  const titleEl = $("pickerTitle");
  const btnCancel = $("pickerCancel");
  const btnDone = $("pickerDone");

  let pickerState = null; // { inputEl, title, values:[{label,value}], selectedIndex }

  function isPhoneLike() {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 700;
  }

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
  wheel?.addEventListener("scroll", () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => markActive(), 60);
  }, { passive: true });

  function openPicker(inputEl, cfg) {
    if (!isPhoneLike()) return; // desktop/web = type normally

    const { title, values, defaultValue } = cfg;

    let current = String(inputEl.value ?? "").trim();
    if (!current) current = String(defaultValue);

    let selectedIndex = values.findIndex(v => v.label === current);
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

  btnCancel?.addEventListener("click", closePicker);
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closePicker(); });

  btnDone?.addEventListener("click", () => {
    if (!pickerState) return;
    const chosen = pickerState.values[pickerState.selectedIndex];
    pickerState.inputEl.value = chosen.label;
    closePicker();
    updateAll();
  });

  function rangeValues({ start, end, step, decimals }) {
    const vals = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
      const v = start + i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) });
    }
    return vals;
  }

  function attachMobilePicker(id, cfg) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("focus", (e) => {
      if (isPhoneLike()) { e.target.blur(); openPicker(el, cfg); }
    });
    el.addEventListener("click", () => openPicker(el, cfg));
  }

  // ================== PDF generation ==================
  function sanitizeFilename(name) {
    return String(name).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  }

  function getInputValueLabel(id) {
    const el = $(id);
    if (!el) return "—";
    const v = String(el.value ?? "").trim();
    return v ? v : "—";
  }

  function downloadPdf() {
    // Ensure latest numbers are on screen
    updateAll();

    const scenario = prompt("Scenario name for this PDF?");
    if (scenario === null) return; // cancelled
    const title = sanitizeFilename(scenario) || "Scenario";

    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      alert("PDF library not loaded. Check your internet connection or the jsPDF script tag.");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const margin = 44;
    let y = margin;

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title, margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("CMS Breakeven Calculator", margin, y);
    y += 18;

    // Helper to write section
    function section(label) {
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(label, margin, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
    }

    function row(k, v) {
      const left = `${k}:`;
      const right = String(v ?? "—");
      const maxWidth = 540;
      doc.setFont("helvetica", "bold");
      doc.text(left, margin, y, { maxWidth: 200 });
      doc.setFont("helvetica", "normal");
      doc.text(right, margin + 170, y, { maxWidth: maxWidth - 170 });
      y += 16;

      if (y > 740) { doc.addPage(); y = margin; }
    }

    // Inputs
    section("Inputs");
    row("In Date", getInputValueLabel("inDate"));
    row("Days on Feed", getInputValueLabel("daysOnFeed"));
    row("ADG", getInputValueLabel("adg"));
    row("Out Date", getInputValueLabel("outDateInline"));
    row("In Weight (lb)", getInputValueLabel("inWeight"));
    row("Out Weight (lb)", getInputValueLabel("outWeight"));
    row("Purchase Price ($/cwt)", getInputValueLabel("priceCwt"));
    row("Projected COG ($/lb gain)", getInputValueLabel("cogNoInterest"));
    row("Death Loss (%)", getInputValueLabel("deathLossPct"));
    row("Futures ($/cwt)", getInputValueLabel("futures"));
    row("Expected Basis ($/cwt)", getInputValueLabel("basis"));

    if (!quickRun) {
      row("Total Head", getInputValueLabel("totalHead"));
      row("Ownership (%)", getInputValueLabel("ownershipPct"));
      row("Head Owned", getInputValueLabel("headOwned"));
      row("Interest Rate (%)", getInputValueLabel("interestRatePct"));
    } else {
      row("Mode", "Quick Run (interest excluded)");
    }

    // Results
    section("Results");
    row("P/L per head", $("plPerHd")?.textContent || "—");
    row("P/L per cwt", $("plPerCwt")?.textContent || "—");

    if (!quickRun) {
      row("Projected Total P/L", $("projectedTotalPL")?.textContent || "—");
      row("Break-even", $("breakEvenCwt")?.textContent || "—");
      row("Sales Price", $("salesPrice")?.textContent || "—");
      row("Capital Invested", $("capitalInvested")?.textContent || "—");
      row("Cattle Sales", $("cattleSales")?.textContent || "—");
      row("ROE", $("roe")?.textContent || "—");
      row("Annualized ROE", $("annualRoe")?.textContent || "—");
      row("IRR", $("irr")?.textContent || "—");
    }

    doc.save(`${title}.pdf`);
  }

  // ====== Reset ======
  function resetAll() {
    ["daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures"].forEach(id => { if ($(id)) $(id).value = ""; });

    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth()+1).padStart(2,"0");
    const dd = String(t.getDate()).padStart(2,"0");
    if ($("inDate")) $("inDate").value = `${yyyy}-${mm}-${dd}`;

    if ($("ownershipPct")) $("ownershipPct").value = "100";

    // defaults
    if ($("interestRatePct")) $("interestRatePct").value = "7.25";
    if ($("cogNoInterest")) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct")) $("deathLossPct").value = "1.0";
    if ($("basis")) $("basis").value = "0.0";

    if ($("adg")) $("adg").value = "—";
    if ($("headOwned")) $("headOwned").value = "—";
    if ($("outDateInline")) $("outDateInline").value = "—";

    clearError();
    resetOutputs();
    applyStatus(NaN);
    updateAll();
  }

  // ====== Init ======
  window.addEventListener("DOMContentLoaded", () => {
    // defaults
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth()+1).padStart(2,"0");
    const dd = String(t.getDate()).padStart(2,"0");
    if ($("inDate") && !$("inDate").value) $("inDate").value = `${yyyy}-${mm}-${dd}`;
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";

    if ($("interestRatePct") && !$("interestRatePct").value) $("interestRatePct").value = "7.25";
    if ($("cogNoInterest") && !$("cogNoInterest").value) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct") && !$("deathLossPct").value) $("deathLossPct").value = "1.0";
    if ($("basis") && !$("basis").value) $("basis").value = "0.0";

    // Mobile picker lists (0.05 increments for interest)
    const irVals  = rangeValues({ start: 0.00, end: 25.00, step: 0.05, decimals: 2 });
    const cogVals = rangeValues({ start: 0.75, end: 1.50, step: 0.01, decimals: 2 });
    const dlVals  = rangeValues({ start: 0.0,  end: 100.0, step: 0.5,  decimals: 1 });
    const bVals   = rangeValues({ start: -100.0, end: 100.0, step: 0.5, decimals: 1 });

    attachMobilePicker("interestRatePct", { title:"Interest Rate (%)", values: irVals, defaultValue: 7.25 });
    attachMobilePicker("cogNoInterest",   { title:"Projected COG", values: cogVals, defaultValue: 1.10 });
    attachMobilePicker("deathLossPct",    { title:"Death Loss (%)", values: dlVals, defaultValue: 1.0 });
    attachMobilePicker("basis",           { title:"Expected Basis", values: bVals, defaultValue: 0.0 });

    // Auto-calc on inputs
    const ids = ["inDate","daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures",
                 "interestRatePct","cogNoInterest","deathLossPct","basis"];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", updateAll);
      el.addEventListener("change", updateAll);
    });

    // Buttons
    $("resetBtn")?.addEventListener("click", resetAll);

    $("quickRunBtn")?.addEventListener("click", () => {
      quickRun = !quickRun;
      applyQuickRunUI();
      updateAll();
    });

    $("downloadPdfBtn")?.addEventListener("click", downloadPdf);

    applyQuickRunUI();
    updateAll();
  });

  // helper to build ranges for wheel picker
  function rangeValues({ start, end, step, decimals }) {
    const vals = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
      const v = start + i * step;
      const value = Number(v.toFixed(decimals));
      vals.push({ value, label: value.toFixed(decimals) });
    }
    return vals;
  }

})();
