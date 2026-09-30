(function () {
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  // ===================== State =====================
  let quickRun = false;
  let adgInputMode = true; // true = input ADG (dof calculated); false = input Days on Feed (adg calculated)
  let equityExpanderOpen = false; // visual only — never affects the stored equity value
  const BASIS_DEFAULT = "";

  // ===================== Formatting =====================
  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const moneyPerCwt = (x) => isFinite(x) ? `${money(x)} /cwt` : "—";
  const moneyPerHd  = (x) => isFinite(x) ? `${money(x)} /hd` : "—";
  const moneyPerHdDay = (x) => isFinite(x) ? `${money(x)} /hd/day` : "—";
  const pct         = (x) => isFinite(x) ? (x * 100).toFixed(2) + "%" : "—";
  const fmtNum      = (x, d=2) => isFinite(x) ? Number(x).toFixed(d) : "—";
  function fmtPctShort(x){
    if (!isFinite(x)) return "0";
    return String(Math.round(x * 100) / 100);
  }

  // ===================== Pure financial math =====================
  // These functions take plain numbers and return plain numbers/objects —
  // no DOM access — so they can be unit tested directly (see tests/finance.test.js).

  // Resolves a scenario-link "eq" query value into a valid equity percentage.
  // Missing, empty, non-numeric, or out-of-range values fall back to 0%
  // (fully financed), matching the app's default financing assumption.
  function resolveEquityPct(paramValue) {
    if (paramValue === null || paramValue === undefined || paramValue === "") return 0;
    const n = Number(paramValue);
    if (!isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
  }

  // Splits a raw equity % input into a clamped equity/financed percentage
  // and fraction pair. Out-of-range or non-finite input is treated as 0%
  // equity (fully financed) — callers that need to surface a validation
  // message do so separately before calling this.
  function computeFinancing(equityPctRaw) {
    const equityPct = isFinite(equityPctRaw) ? Math.min(100, Math.max(0, equityPctRaw)) : 0;
    const financedPct = 100 - equityPct;
    return {
      equityPct,
      financedPct,
      equityFraction: equityPct / 100,
      financedFraction: financedPct / 100
    };
  }

  // Per-head cost/interest breakdown. Reuses the existing average-balance
  // interest method (purchase cost charged interest for the full feeding
  // period; feed/operating cost charged interest on its average — 50% —
  // outstanding balance), scaled to the financed share of each cost so
  // equity capital never accrues interest.
  function computeCostBreakdown({ inWeight, priceCwt, outWeight, cogNoInterest, deathLossPct, interestRatePct, daysOnFeed, equityPct }) {
    const gained = outWeight - inWeight;
    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deathLoss = deathLossPct / 100.0;
    const deadLossDollars = deathLoss * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    const { financedFraction } = computeFinancing(equityPct);
    const interestRate = interestRatePct / 100.0;
    const financedCostPerHd = costPerHd * financedFraction;
    const financedCOG = perHdCOG * financedFraction;

    const interestPerHd = (((financedCostPerHd + (0.5 * financedCOG)) * interestRate) / 365.0) * daysOnFeed;
    const totalCostPerHd = costPerHd + perHdCOG + interestPerHd;

    return { gained, costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd };
  }

  // ROE / Annualized ROE using the equity actually invested under this
  // financing model (not a hidden hard-coded equity %). Undefined (NaN,
  // displayed as an em dash) when no equity cash is invested — return on
  // zero dollars isn't a defined number.
  function computeReturns({ projectedTotalPL, capitalInvested, equityPct, daysOnFeed }) {
    const { equityFraction } = computeFinancing(equityPct);
    const equityInvested = capitalInvested * equityFraction;

    // With no cash equity invested, "return on equity" has no denominator.
    // Fall back to Return on Total Capital (unlevered) — profit relative to
    // the full cost of the cattle — which is always well-defined and never
    // silently shown as Infinity. Any equity above $0 uses true equity ROE.
    const usingTotalCapitalBasis = !(equityInvested > 0);
    const roeBasis = usingTotalCapitalBasis ? capitalInvested : equityInvested;

    const roe = (roeBasis > 0) ? (projectedTotalPL / roeBasis) : NaN;
    const years = daysOnFeed / 365.0;
    const annualRoe = (isFinite(roe) && years > 0) ? (Math.pow(1 + roe, 1 / years) - 1) : NaN;
    return { equityInvested, roe, annualRoe, usingTotalCapitalBasis, roeBasis };
  }

  function computePlPerHdPerDay(plPerHd, daysOnFeed) {
    return (isFinite(plPerHd) && isFinite(daysOnFeed) && daysOnFeed > 0) ? (plPerHd / daysOnFeed) : NaN;
  }

  // ===================== Parsing =====================
  function numOrNaN(id) {
    const raw = String($(id)?.value ?? "").trim();
    if (raw === "") return NaN;
    const v = Number(raw);
    return isFinite(v) ? v : NaN;
  }
  function strOrEmpty(id) {
    return String($(id)?.value ?? "").trim();
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
  function dateToISO(d){
    if (!d || isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function niceDate(d) {
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  }

  function clearError(){ setText("errorText",""); }
  function softError(msg){ setText("errorText", msg || ""); }

  // ===================== Basis normalization =====================
  function normalizeBasisValue(raw) {
    const s = String(raw ?? "").trim();
    // Allow "-" mid-type so user can enter negative numbers
    if (s === "-") return "-";
    // Empty or invalid => default to 0
    if (s === "") return "0";

    const n = Number(s);
    if (!isFinite(n)) return "0";

    // Basis picker uses whole-dollar increments
    return String(Math.round(n));
  }

  function ensureBasisDefault() {
    const basisEl = $("basis");
    if (!basisEl) return;
    const normalized = normalizeBasisValue(basisEl.value);
    if (document.activeElement !== basisEl) basisEl.value = normalized;
  }

  // ===================== Status coloring =====================
  function applyStatus(plPerHd){
    const tiles = [$("tilePlPerHdPerDay"), $("tilePlPerHd"), $("tileTotalPL")].filter(Boolean);
    tiles.forEach(t => t.classList.remove("good","mid","bad"));
    if (!isFinite(plPerHd)) return;
    const cls = (plPerHd >= 50) ? "good" : (plPerHd >= -25 ? "mid" : "bad");
    tiles.forEach(t => t.classList.add(cls));
  }

  // ===================== Derived fields =====================
  function applyDofAdgModeUI(){
    const adgBtn = $("modeAdgBtn");
    const dofBtn = $("modeDofBtn");
    if (adgBtn) adgBtn.setAttribute("aria-pressed", adgInputMode ? "true" : "false");
    if (dofBtn) dofBtn.setAttribute("aria-pressed", adgInputMode ? "false" : "true");

    const dofEl = $("daysOnFeed");
    const adgEl = $("adg");
    if (dofEl) { dofEl.readOnly = adgInputMode; dofEl.tabIndex = adgInputMode ? -1 : 0; }
    if (adgEl) { adgEl.readOnly = !adgInputMode; adgEl.tabIndex = adgInputMode ? 0 : -1; }

    // A field that just became editable may still hold the "—" placeholder
    // value it showed while it was the calculated (uncomputable) field —
    // clear it so typing doesn't require backspacing it first.
    const editableEl = adgInputMode ? adgEl : dofEl;
    if (editableEl && editableEl.value === "—") editableEl.value = "";

    const dofLabel = $("daysOnFeedLabel");
    if (dofLabel) dofLabel.textContent = "Days on Feed" + (adgInputMode ? " (calculated)" : "");

    const adgLabel = $("adgLabel");
    if (adgLabel) adgLabel.textContent = "ADG (lb/day)" + (adgInputMode ? "" : " (calculated)");
  }

  // ===================== Equity / financing expander =====================
  function applyEquityExpanderUI(){
    const panel = $("equityExpanderPanel");
    const toggle = $("equityExpanderToggle");
    if (panel) panel.classList.toggle("hidden", !equityExpanderOpen);
    if (toggle) toggle.setAttribute("aria-expanded", equityExpanderOpen ? "true" : "false");
  }

  function updateEquitySummary(){
    const financedEl = $("financedPct");
    const summaryEl = $("equitySummaryText");
    const raw = strOrEmpty("equityPct");
    const num = raw === "" ? 0 : Number(raw);
    const valid = isFinite(num) && num >= 0 && num <= 100;

    if (!valid) {
      if (financedEl) financedEl.value = "—";
      if (summaryEl) summaryEl.textContent = "Enter a value from 0–100%";
      return;
    }

    const financedPct = 100 - num;
    if (financedEl) financedEl.value = fmtPctShort(financedPct);
    if (summaryEl) summaryEl.textContent = `${fmtPctShort(num)}% equity · ${fmtPctShort(financedPct)}% financed`;
  }

  // ===================== Ownership clarification =====================
  // Only labels results that are actually scaled by Head Owned (myHead) —
  // Projected Total P/L, Capital, Hedging, and Returns. Per-head/per-cwt
  // figures (P/L per head, Breakeven, Sales Price, P/L per hd/day) are the
  // same regardless of ownership % and must never carry this note.
  function updateOwnershipNotes(show, ownershipPct){
    const text = show ? `Your share · ${fmtPctShort(ownershipPct)}% ownership` : "";
    ["ownershipNoteHero","ownershipNoteCapital","ownershipNoteHedging","ownershipNoteReturns"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("hidden", !show);
    });
  }

  // ===================== Sticky results (desktop) =====================
  function updateResultsSticky(){
    const card = document.querySelector(".resultsCard");
    if (!card) return;
    const isDesktop = window.matchMedia("(min-width:980px)").matches;
    if (!isDesktop) { card.classList.remove("stickyFits"); return; }

    card.classList.remove("stickyFits");
    const margin = 28;
    const fits = card.scrollHeight <= (window.innerHeight - margin);
    card.classList.toggle("stickyFits", fits);
  }

  // ===================== Mobile sticky P/L bar =====================
  function syncMobileStickyBar(){
    [["plPerHd","mStickyPlPerHd"], ["projectedTotalPL","mStickyTotalPL"]].forEach(([srcId, dstId]) => {
      const s = $(srcId), d = $(dstId);
      if (s && d) d.textContent = s.textContent;
    });

    [["tilePlPerHd","mStickyItemPlPerHd"], ["tileTotalPL","mStickyItemTotalPL"]].forEach(([heroId, stickyId]) => {
      const hero = $(heroId), sticky = $(stickyId);
      if (!hero || !sticky) return;
      sticky.classList.remove("good","mid","bad");
      ["good","mid","bad"].forEach(cls => { if (hero.classList.contains(cls)) sticky.classList.add(cls); });
    });
  }

  // ===================== Shrink-to-fit big numbers =====================
  // Never wraps (the element is white-space:nowrap in CSS) — instead steps
  // the font size down until the text fits on one line within its box.
  function fitValueText(el, idealPx, minPx){
    if (!el) return;
    el.style.fontSize = idealPx + "px";
    let size = idealPx;
    while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  function fitBigValues(){
    fitValueText($("plPerHd"), 27, 13);
    fitValueText($("projectedTotalPL"), 27, 13);
    fitValueText($("mStickyPlPerHd"), 24, 12);
    fitValueText($("mStickyTotalPL"), 24, 12);
  }

  function updateFeedPeriod(){
    const inWeight = numOrNaN("inWeight");
    const outWeight = numOrNaN("outWeight");
    const dofEl = $("daysOnFeed");
    const adgEl = $("adg");
    if (!dofEl || !adgEl) return;

    const gained = (isFinite(inWeight) && isFinite(outWeight) && outWeight > inWeight)
      ? (outWeight - inWeight)
      : NaN;

    if (adgInputMode) {
      const adg = numOrNaN("adg");
      dofEl.value = (isFinite(gained) && isFinite(adg) && adg > 0)
        ? String(Math.round(gained / adg))
        : "—";
    } else {
      const daysOnFeed = numOrNaN("daysOnFeed");
      adgEl.value = (isFinite(gained) && isFinite(daysOnFeed) && daysOnFeed > 0)
        ? fmtNum(gained / daysOnFeed, 2)
        : "—";
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

  function updateHeadOwnedTip(){
    const tipWrap = $("wrapHeadOwnedTip");
    const tipVal = $("headOwnedTip");
    if (!tipWrap || !tipVal) return NaN;

    if (quickRun) {
      tipWrap.classList.add("hidden");
      tipVal.textContent = "—";
      setText("d_myHead", "—");
      return NaN;
    }

    tipWrap.classList.remove("hidden");

    const totalHead = numOrNaN("totalHead");
    const ownershipPct = numOrNaN("ownershipPct");

    if (isFinite(totalHead) && totalHead > 0 && isFinite(ownershipPct) && ownershipPct >= 0) {
      const myHead = totalHead * (ownershipPct / 100.0);
      const txt = myHead.toLocaleString(undefined, { maximumFractionDigits: 2 });
      tipVal.textContent = txt;
      setText("d_myHead", txt);
      return myHead;
    }

    tipVal.textContent = "—";
    setText("d_myHead", "—");
    return NaN;
  }

  // ===================== Contracts needed =====================
  function computeContractsNeeded(myHead, outWeightLb) {
    if (!isFinite(myHead) || myHead <= 0 || !isFinite(outWeightLb) || outWeightLb <= 0) return null;

    const totalLb = myHead * outWeightLb;
    const isFeeder = outWeightLb < 1000;

    const denom = isFeeder ? 50000 : 40000;
    const n = totalLb / denom;

    return {
      contracts: n,
      kind: isFeeder ? "Feeder Cattle" : "Live Cattle",
      denomLb: denom,
      isFeeder
    };
  }

  function renderContractsUI(info, outWeightLb) {
    const tile = $("tileContractsNeeded");
    const val = $("contractsNeeded");
    const label = $("contractsLabel");
    const tip = $("contractsTooltip");
    const basisCell = $("d_contractsBasis");

    if (!tile || !val || !label) return;

    const show = !quickRun;
    tile.classList.toggle("hidden", !show);

    if (!show || !info) {
      val.textContent = "—";
      label.textContent = "Contracts Needed";
      basisCell && (basisCell.textContent = "—");
      return;
    }

    const shown = info.contracts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    label.textContent = `${info.kind} Contracts Needed`;
    val.textContent = shown;

    const msg =
      `Based on Head Owned (not the full lot). ` +
      `${info.kind} used because Out Weight is ${outWeightLb < 1000 ? "under" : "at/over"} 1,000 lb. ` +
      `Formula: (Head Owned × Out Weight) ÷ ${info.denomLb.toLocaleString()} lb per contract.`;

    if (tip) tip.textContent = msg;
    if (basisCell) basisCell.textContent = msg;
  }

  // ===================== UI toggles =====================
  function applyQuickRunUI(){
    const btn = $("quickRunBtn");
    if (btn) {
      btn.textContent = `Quick Run: ${quickRun ? "ON" : "OFF"}`;
      btn.setAttribute("data-on", quickRun ? "true" : "false");
    }

    $("wrapTotalHead")?.classList.toggle("hidden", quickRun);
    $("wrapOwnershipPct")?.classList.toggle("hidden", quickRun);
    $("wrapHeadOwnedTip")?.classList.toggle("hidden", quickRun);

    const hide = (id, shouldHide) => { const el = $(id); if (el) el.classList.toggle("hidden", shouldHide); };

    hide("tileTotalPL", quickRun);
    hide("tileCapitalInvested", quickRun);
    hide("tileCattleSales", quickRun);
    hide("tileRoe", quickRun);
    hide("tileAnnualRoe", quickRun);
    hide("tileIrr", quickRun);
    hide("sectionCapital", quickRun);
    hide("sectionHedging", quickRun);
    hide("sectionReturns", quickRun);
    $("detailsPanel")?.classList.toggle("hidden", quickRun);

    $("tileContractsNeeded")?.classList.toggle("hidden", quickRun);
    $("heroGrid")?.classList.toggle("single", quickRun);
  }

  // ===================== Outputs reset =====================
  function resetOutputs(){
    [
      "plPerHd","plPerHdPerDay","projectedTotalPL","plPerCwt","breakEvenCwt","salesPrice",
      "capitalInvested","cattleSales","roe","annualRoe","irr",
      "contractsNeeded",
      "d_costPerHd","d_deadLossDollars","d_feedCost","d_perHdCOG","d_interestPerHd",
      "d_totalCostPerHd","d_salesPerHd","d_myHead","d_contractsBasis",
      "d_financingBase","d_equityPctDisplay","d_equityInvested","d_financedPctDisplay",
      "d_borrowedAmount","d_roeEquityBasis"
    ].forEach(id => setText(id, "—"));
    updateOwnershipNotes(false, 0);
    $("returnsZeroEquityNote")?.classList.add("hidden");
  }

  // ===================== IRR (two-point) =====================
  function irrTwoPoint(c0, c1, d0, d1) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const t = (d1 - d0) / msPerDay / 365.0;
    if (!(t > 0)) return NaN;
    const ratio = -c1 / c0;
    if (ratio > 0) return Math.pow(ratio, 1 / t) - 1;
    return NaN;
  }

  // ===================== Main calc =====================
  function updateAll(){
    clearError();

    ensureBasisDefault();

    updateFeedPeriod();
    updateEquitySummary();
    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateInline();

    requestAnimationFrame(() => { updateResultsSticky(); syncMobileStickyBar(); fitBigValues(); });

    const daysOnFeed = numOrNaN("daysOnFeed");
    const interestRatePct = numOrNaN("interestRatePct");
    const interestRate = interestRatePct / 100.0;

    const totalHead = numOrNaN("totalHead");
    const ownershipPctRaw = numOrNaN("ownershipPct");
    const ownership = ownershipPctRaw / 100.0;

    const inWeight = numOrNaN("inWeight");
    const priceCwt = numOrNaN("priceCwt");
    const outWeight = numOrNaN("outWeight");

    const cogNoInterest = numOrNaN("cogNoInterest");
    const deathLossPct = numOrNaN("deathLossPct");
    const deathLoss = deathLossPct / 100.0;

    const equityPctRaw = numOrNaN("equityPct");

    const futures = numOrNaN("futures");
    const basis = numOrNaN("basis");

    const myHeadFromTip = updateHeadOwnedTip();

    if (isFinite(daysOnFeed) && daysOnFeed < 0) {
      softError("Days on Feed must be > 0.");
      resetOutputs(); applyStatus(NaN);
      renderContractsUI(null, outWeight);
      return null;
    }
    if (isFinite(inWeight) && isFinite(outWeight) && inWeight > 0 && outWeight > 0 && outWeight <= inWeight) {
      softError("Out Weight must be greater than In Weight.");
      resetOutputs(); applyStatus(NaN);
      renderContractsUI(null, outWeight);
      return null;
    }
    if (isFinite(equityPctRaw) && (equityPctRaw < 0 || equityPctRaw > 100)) {
      softError("Equity contribution must be between 0% and 100%.");
      resetOutputs(); applyStatus(NaN);
      renderContractsUI(null, outWeight);
      return null;
    }

    const equityPct = isFinite(equityPctRaw) ? equityPctRaw : 0;

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
      renderContractsUI(null, outWeight);
      return null;
    }

    const {
      gained, costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd
    } = computeCostBreakdown({
      inWeight, priceCwt, outWeight, cogNoInterest, deathLossPct, interestRatePct, daysOnFeed, equityPct
    });

    const breakEvenCwt = (totalCostPerHd / outWeight) * 100.0;

    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));

    setText("d_costPerHd", money(costPerHd));
    setText("d_deadLossDollars", money(deadLossDollars));
    setText("d_feedCost", money(feedCost));
    setText("d_perHdCOG", money(perHdCOG));
    setText("d_interestPerHd", money(interestPerHd));
    setText("d_totalCostPerHd", money(totalCostPerHd));
    setText("d_equityPctDisplay", fmtPctShort(equityPct) + "%");
    setText("d_financedPctDisplay", fmtPctShort(100 - equityPct) + "%");

    if (!(isFinite(futures) && isFinite(basis))) {
      setText("salesPrice","—");
      setText("plPerCwt","—");
      setText("plPerHd","—");
      setText("plPerHdPerDay","—");

      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_salesPerHd","—");
      setText("d_financingBase","—");
      setText("d_equityInvested","—");
      setText("d_borrowedAmount","—");
      setText("d_roeEquityBasis","—");
      updateOwnershipNotes(false, 0);
      $("returnsZeroEquityNote")?.classList.add("hidden");

      applyStatus(NaN);
      renderContractsUI(null, outWeight);
      return null;
    }

    const salesPrice = futures + basis;
    const plPerCwt = salesPrice - breakEvenCwt;
    const plPerHd = (plPerCwt * outWeight) / 100.0;
    const plPerHdPerDay = computePlPerHdPerDay(plPerHd, daysOnFeed);

    setText("salesPrice", moneyPerCwt(salesPrice));
    setText("plPerCwt", moneyPerCwt(plPerCwt));
    setText("plPerHd", moneyPerHd(plPerHd));
    setText("plPerHdPerDay", moneyPerHdDay(plPerHdPerDay));

    const salesPerHd = (salesPrice * outWeight) / 100.0;
    setText("d_salesPerHd", money(salesPerHd));

    if (quickRun) {
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_financingBase","—");
      setText("d_equityInvested","—");
      setText("d_borrowedAmount","—");
      setText("d_roeEquityBasis","—");
      setText("contractsNeeded","—");
      setText("d_contractsBasis","—");
      updateOwnershipNotes(false, 0);
      $("returnsZeroEquityNote")?.classList.add("hidden");
      renderContractsUI(null, outWeight);
      applyStatus(plPerHd);
      return null;
    }

    const haveTotals = isFinite(totalHead) && totalHead > 0 && isFinite(ownership) && ownership > 0;
    if (!haveTotals) {
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_financingBase","—");
      setText("d_equityInvested","—");
      setText("d_borrowedAmount","—");
      setText("d_roeEquityBasis","—");
      updateOwnershipNotes(false, 0);
      $("returnsZeroEquityNote")?.classList.add("hidden");
      renderContractsUI(null, outWeight);
      applyStatus(plPerHd);
      return null;
    }

    const myHead = totalHead * ownership;

    const capitalInvested = totalCostPerHd * myHead;
    const cattleSales = salesPerHd * myHead;
    const projectedTotalPL = plPerHd * myHead;

    setText("capitalInvested", money(capitalInvested));
    setText("cattleSales", money(cattleSales));
    setText("projectedTotalPL", money(projectedTotalPL));

    const showOwnershipNote = ownershipPctRaw < 100;
    updateOwnershipNotes(showOwnershipNote, ownershipPctRaw);

    const { equityInvested, roe, annualRoe, usingTotalCapitalBasis, roeBasis } = computeReturns({
      projectedTotalPL, capitalInvested, equityPct, daysOnFeed
    });

    const borrowedAmount = capitalInvested - equityInvested;

    setText("d_financingBase", money(capitalInvested));
    setText("d_equityInvested", money(equityInvested));
    setText("d_borrowedAmount", money(borrowedAmount));
    setText("d_roeEquityBasis", money(roeBasis));

    setText("roe", pct(roe));
    setText("annualRoe", pct(annualRoe));
    $("returnsZeroEquityNote")?.classList.toggle("hidden", !usingTotalCapitalBasis);

    let irr = NaN;
    if (inDate && outDate) {
      irr = irrTwoPoint(-capitalInvested, cattleSales, inDate, outDate);
      setText("irr", pct(irr));
    } else {
      setText("irr","—");
    }

    const cInfo = computeContractsNeeded(myHead, outWeight);
    renderContractsUI(cInfo, outWeight);

    applyStatus(plPerHd);

    return {
      quickRun,
      inDate, outDate,
      daysOnFeed,
      totalHead, ownershipPct: ownership*100,
      myHead,
      inWeight, outWeight, adg: Number(strOrEmpty("adg")) || NaN,
      priceCwt,
      cogNoInterest,
      deathLossPct,
      interestRatePct,
      equityPct,
      futures, basis,
      breakEvenCwt, salesPrice, plPerCwt, plPerHd, plPerHdPerDay,
      costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd,
      salesPerHd,
      capitalInvested, cattleSales, projectedTotalPL,
      equityInvested, borrowedAmount,
      roe, annualRoe, irr,
      contracts: cInfo
    };
  }

  // ===================== Mobile wheel picker =====================
  const overlay = $("pickerOverlay");
  const wheel = $("pickerWheel");
  const titleEl = $("pickerTitle");
  const btnCancel = $("pickerCancel");
  const btnDone = $("pickerDone");

  let pickerState = null;

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
    if (!isPhoneLike()) return;

    const { title, values, defaultValue, normalize } = cfg;

    let current = String(inputEl.value ?? "").trim();
    if (typeof normalize === "function") current = String(normalize(current));

    if (!current) current = String(defaultValue);

    let selectedIndex = -1;

    const currentNum = Number(current);
    if (isFinite(currentNum)) {
      selectedIndex = values.findIndex(v => Number(v.value) === currentNum);
    }

    if (selectedIndex < 0) {
      selectedIndex = values.findIndex(v => v.label === current);
    }

    if (selectedIndex < 0) {
      const defNum = Number(defaultValue);
      if (isFinite(defNum)) {
        selectedIndex = values.findIndex(v => Number(v.value) === defNum);
      }
    }

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
      if (isPhoneLike()) {
        e.target.blur();
        openPicker(el, cfg);
      }
    });
    el.addEventListener("click", () => openPicker(el, cfg));
  }

  // ===================== Scenario share =====================
  function buildScenarioUrl() {
    const p = new URLSearchParams();
    p.set("qr", quickRun ? "1" : "0");
    p.set("am", adgInputMode ? "1" : "0");

    const fields = [
      ["inDate","id"], ["daysOnFeed","dof"], ["adg","adg"],
      ["totalHead","th"], ["ownershipPct","own"],
      ["inWeight","iw"], ["priceCwt","pp"], ["outWeight","ow"],
      ["cogNoInterest","cog"], ["deathLossPct","dl"],
      ["interestRatePct","ir"], ["futures","fut"], ["basis","bas"]
    ];

    for (const [id, key] of fields) {
      const v = strOrEmpty(id);
      if (v !== "") p.set(key, v);
    }

    p.set("eq", strOrEmpty("equityPct") || "0");

    const url = new URL(window.location.href);
    url.search = p.toString();
    return url.toString();
  }

  async function shareScenario() {
    const url = buildScenarioUrl();

    try {
      await navigator.clipboard.writeText(url);
      alert("Scenario link copied to clipboard.");
      return;
    } catch (_) {}

    try {
      if (navigator.share) {
        await navigator.share({
          title: "CMS Breakeven Scenario",
          text: "Here’s a CMS breakeven scenario link.",
          url
        });
        return;
      }
    } catch (_) {}

    prompt("Copy this scenario link:", url);
  }

  function applyScenarioFromUrl() {
    const p = new URLSearchParams(window.location.search);
    if (!p || [...p.keys()].length === 0) return;

    quickRun = p.get("qr") === "1";
    adgInputMode = p.has("am") ? (p.get("am") === "1") : true;

    const map = [
      ["inDate","id"], ["daysOnFeed","dof"], ["adg","adg"],
      ["totalHead","th"], ["ownershipPct","own"],
      ["inWeight","iw"], ["priceCwt","pp"], ["outWeight","ow"],
      ["cogNoInterest","cog"], ["deathLossPct","dl"],
      ["interestRatePct","ir"], ["futures","fut"], ["basis","bas"]
    ];

    for (const [id, key] of map) {
      const v = p.get(key);
      if (v !== null && $(id)) $(id).value = v;
    }

    if ($("equityPct")) $("equityPct").value = String(resolveEquityPct(p.get("eq")));

    ensureBasisDefault();
  }

  // ===================== PDF =====================
  function sanitizeFilename(name) {
    return String(name).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  }

  function rrect(doc, x,y,w,h,r, fillRGB, strokeRGB){
    if (strokeRGB) doc.setDrawColor(strokeRGB[0],strokeRGB[1],strokeRGB[2]);
    if (fillRGB) doc.setFillColor(fillRGB[0],fillRGB[1],fillRGB[2]);
    doc.roundedRect(x,y,w,h,r,r, fillRGB ? "FD" : "S");
  }

  function downloadPdf() {
    updateAll();

    const scenario = prompt("Scenario name for this PDF?");
    if (scenario === null) return;

    const scenarioName = scenario.trim() || "Scenario";
    const filename = sanitizeFilename(scenarioName) || "Scenario";

    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      alert("PDF library not loaded. Check the jsPDF script tag / connection.");
      return;
    }

    const inDate = parseDateOrNull("inDate");
    const outDate = (inDate && isFinite(numOrNaN("daysOnFeed")) && numOrNaN("daysOnFeed") > 0)
      ? addDays(inDate, numOrNaN("daysOnFeed"))
      : null;

    const v_plHd = $("plPerHd")?.textContent || "—";
    const v_totalPL = $("projectedTotalPL")?.textContent || "—";
    const v_plHdDay = $("plPerHdPerDay")?.textContent || "—";

    const v_be = $("breakEvenCwt")?.textContent || "—";
    const v_sale = $("salesPrice")?.textContent || "—";

    const v_contractsLabel = $("contractsLabel")?.textContent || "Contracts Needed";
    const v_contractsVal = $("contractsNeeded")?.textContent || "—";
    const v_contractsTip = ($("contractsTooltip")?.textContent || "").replace(/\s+/g, " ").trim();

    const v_roe = $("roe")?.textContent || "—";
    const v_aroe = $("annualRoe")?.textContent || "—";
    const v_irr = $("irr")?.textContent || "—";

    const v_cap = $("capitalInvested")?.textContent || "—";
    const v_sales = $("cattleSales")?.textContent || "—";

    const v_dof = strOrEmpty("daysOnFeed") || "—";
    const v_headOwned = quickRun ? "—" : ($("headOwnedTip")?.textContent || "—");

    const i_totalHead = quickRun ? "—" : (strOrEmpty("totalHead") || "—");
    const ownershipRaw = strOrEmpty("ownershipPct");
    const i_ownership = quickRun ? "—" : (ownershipRaw ? `${ownershipRaw}%` : "—");

    const i_inWt = (strOrEmpty("inWeight") || "—") + " lb";
    const i_outWt = (strOrEmpty("outWeight") || "—") + " lb";
    const i_adg = (strOrEmpty("adg") || "—");
    const i_dl = (strOrEmpty("deathLossPct") || "—") + "%";

    const i_purchase = (strOrEmpty("priceCwt") || "—") + " / cwt";
    const i_cog = (strOrEmpty("cogNoInterest") || "—") + " / lb";
    const i_fut = (strOrEmpty("futures") || "—") + " / cwt";
    const i_bas = (strOrEmpty("basis") || "—") + " / cwt";

    const i_ir = (strOrEmpty("interestRatePct") || "—") + "%";
    const i_equity = $("equitySummaryText")?.textContent || "0% equity · 100% financed";

    const showOwnershipNote = !quickRun && !($("ownershipNoteCapital")?.classList.contains("hidden") ?? true);
    const ownershipNoteText = $("ownershipNoteCapital")?.textContent || "";
    const showZeroEquityNote = !quickRun && !($("returnsZeroEquityNote")?.classList.contains("hidden") ?? true);
    const zeroEquityNoteText = $("returnsZeroEquityNote")?.textContent || "";

    function statusOf(id){
      const el = $(id);
      if (!el) return null;
      if (el.classList.contains("good")) return "good";
      if (el.classList.contains("mid")) return "mid";
      if (el.classList.contains("bad")) return "bad";
      return null;
    }
    const plStatus = statusOf("tilePlPerHd");

    // ===== Layout mirroring the on-screen app: blue header, hero P/L
    // tiles colored by status, then the same section groups (Pricing,
    // Capital, Hedging, Returns) and Inputs sections, in the same order. =====
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612, H = 792;
    const margin = 40;
    const contentW = W - margin * 2;

    const pageBg = [247, 249, 252];
    const cmsBlue = [51, 102, 153];
    const muted = [107, 114, 128];
    const ink = [15, 23, 42];
    const border = [219, 227, 239];
    const white = [255, 255, 255];

    const statusPalette = {
      good: { bg: [236, 253, 245], bd: [16, 185, 129], tx: [6, 95, 70] },
      mid:  { bg: [255, 251, 235], bd: [245, 158, 11], tx: [146, 64, 14] },
      bad:  { bg: [254, 242, 242], bd: [239, 68, 68],  tx: [127, 29, 29] }
    };

    const tc = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const font = (weight, size) => { doc.setFont("helvetica", weight); doc.setFontSize(size); };

    let y = 0;

    function paintPageBg(){
      doc.setFillColor(pageBg[0], pageBg[1], pageBg[2]);
      doc.rect(0, 0, W, H, "F");
    }
    function newPage(){
      doc.addPage();
      paintPageBg();
      y = margin;
    }
    function ensureSpace(needed){
      if (y + needed > H - margin) newPage();
    }
    function sectionLabel(text, yy){
      font("bold", 9); tc(muted);
      doc.text(String(text).toUpperCase(), margin, yy);
      doc.setDrawColor(border[0], border[1], border[2]);
      doc.line(margin, yy + 6, margin + contentW, yy + 6);
    }
    // N evenly-spaced {label, value, status} columns, like a .resultRow
    function statRow(cols, yy){
      const gap = 16;
      const colW = (contentW - gap * (cols.length - 1)) / cols.length;
      cols.forEach((c, i) => {
        const x = margin + i * (colW + gap);
        font("normal", 8); tc(muted);
        doc.text(String(c.label).toUpperCase(), x, yy);
        const pal = c.status ? statusPalette[c.status] : null;
        font("bold", 13); tc(pal ? pal.tx : ink);
        doc.text(String(c.value), x, yy + 16);
      });
    }
    // A section of label:value rows, two per row, like the Inputs card
    function inputSection(title, rows, yy){
      ensureSpace(18 + rows.length * 15 + 14);
      sectionLabel(title, yy);
      let yyy = yy + 20;
      const colGap = 24;
      const colW = (contentW - colGap) / 2;
      rows.forEach((pair) => {
        pair.forEach((kvItem, ci) => {
          if (!kvItem) return;
          const x = margin + ci * (colW + colGap);
          font("normal", 9); tc(muted);
          doc.text(kvItem[0], x, yyy);
          font("bold", 9); tc(ink);
          doc.text(kvItem[1], x + 108, yyy);
        });
        yyy += 15;
      });
      return yyy + 10;
    }

    paintPageBg();

    doc.setFillColor(cmsBlue[0], cmsBlue[1], cmsBlue[2]);
    doc.rect(0, 0, W, 38, "F");
    font("bold", 15); tc(white);
    doc.text("CMS Breakeven Calculator", margin, 25);

    y = 38 + 24;
    font("bold", 16); tc(ink);
    doc.text(scenarioName, margin, y);

    y += 14;
    font("normal", 9); tc(muted);
    doc.text(
      `In Date ${niceDate(inDate)}   ·   Out Date ${niceDate(outDate)}   ·   Days on Feed ${v_dof}` +
      (quickRun ? "   ·   Quick Run" : `   ·   ${v_headOwned} head owned`),
      margin, y
    );
    y += 18;

    // ---------- Hero tiles (P/L per head, Projected Total P/L) ----------
    const heroH = 58, heroGap = 10;
    const heroW = (contentW - heroGap) / 2;
    const heroPal = plStatus ? statusPalette[plStatus] : { bg: white, bd: border, tx: ink };

    rrect(doc, margin, y, heroW, heroH, 10, heroPal.bg, heroPal.bd);
    rrect(doc, margin + heroW + heroGap, y, heroW, heroH, 10, heroPal.bg, heroPal.bd);

    font("normal", 9); tc(heroPal.tx);
    doc.text("P/L PER HEAD", margin + 14, y + 20);
    doc.text("PROJECTED TOTAL P/L", margin + heroW + heroGap + 14, y + 20);

    font("bold", 21); tc(heroPal.tx);
    doc.text(v_plHd, margin + 14, y + 44);
    doc.text(String(v_totalPL), margin + heroW + heroGap + 14, y + 44);

    y += heroH + 18;

    // ---------- Pricing ----------
    sectionLabel("Pricing", y);
    y += 22;
    statRow([
      { label: "Breakeven ($/cwt)", value: v_be },
      { label: "Projected Sales Price", value: v_sale },
      { label: "P/L /hd/day", value: v_plHdDay, status: plStatus }
    ], y);
    y += 28;

    if (!quickRun) {
      // ---------- Capital ----------
      sectionLabel("Capital", y);
      y += 20;
      if (showOwnershipNote) {
        font("bold", 8); tc(muted);
        doc.text(ownershipNoteText, margin, y);
        y += 14;
      }
      statRow([
        { label: "Capital Invested", value: v_cap },
        { label: "Cattle Sales", value: v_sales }
      ], y);
      y += 28;

      // ---------- Hedging ----------
      sectionLabel("Hedging", y);
      y += 20;
      font("normal", 8); tc(muted);
      doc.text(v_contractsLabel.toUpperCase(), margin, y);
      font("bold", 13); tc(ink);
      doc.text(v_contractsVal, margin, y + 16);
      if (v_contractsTip) {
        font("normal", 8); tc(muted);
        const wrapped = doc.splitTextToSize(v_contractsTip, contentW);
        doc.text(wrapped, margin, y + 30);
        y += 30 + wrapped.length * 10;
      } else {
        y += 26;
      }
      y += 8;

      // ---------- Returns ----------
      sectionLabel("Returns", y);
      y += 22;
      statRow([
        { label: "ROE", value: v_roe },
        { label: "Annualized ROE", value: v_aroe },
        { label: "IRR", value: v_irr }
      ], y);
      y += 30;
      if (showZeroEquityNote) {
        font("normal", 8); tc(muted);
        const wrapped = doc.splitTextToSize(zeroEquityNoteText, contentW);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 10 + 6;
      }
      y += 10;
    }

    // ---------- Inputs (mirrors the on-screen Inputs card sections) ----------
    ensureSpace(30);
    font("bold", 11); tc(ink);
    doc.text("Inputs", margin, y);
    y += 16;

    y = inputSection("Cattle & Ownership", [
      [["In Date:", niceDate(inDate)], ["Total Head:", i_totalHead]],
      [["Ownership:", i_ownership], ["Head Owned:", String(v_headOwned)]],
      [["In Weight:", i_inWt], ["Purchase Price:", i_purchase]]
    ], y);

    y = inputSection("Projections", [
      [["Out Weight:", i_outWt], ["ADG:", i_adg]],
      [["Days on Feed:", v_dof], ["Out Date:", niceDate(outDate)]],
      [["Cost of Gain (Dead's Out):", i_cog], ["Death Loss:", i_dl]]
    ], y);

    y = inputSection("Financing", [
      [["Interest Rate:", i_ir], ["Equity / Financed:", i_equity]]
    ], y);

    y = inputSection("Market Assumptions", [
      [["Futures:", i_fut], ["Expected Basis:", i_bas]]
    ], y);

    doc.save(`${filename}.pdf`);
  }

  // ===================== Reset =====================
  function resetAll() {
    const clearIds = ["daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures"];
    clearIds.forEach(id => { if ($(id)) $(id).value = ""; });

    const t = new Date();
    if ($("inDate")) $("inDate").value = dateToISO(t);

    if ($("ownershipPct")) $("ownershipPct").value = "100";

    if ($("interestRatePct")) $("interestRatePct").value = "7.25";
    if ($("cogNoInterest")) $("cogNoInterest").value = "";
    if ($("deathLossPct")) $("deathLossPct").value = "";
    if ($("basis")) $("basis").value = "0";

    if ($("daysOnFeed")) $("daysOnFeed").value = "";
    if ($("adg")) $("adg").value = "";
    if ($("outDateInline")) $("outDateInline").value = "—";

    if ($("equityPct")) $("equityPct").value = "0";
    equityExpanderOpen = false;
    applyEquityExpanderUI();

    clearError();
    resetOutputs();
    applyStatus(NaN);
    updateAll();
  }

  // ===================== Init =====================
  window.addEventListener("DOMContentLoaded", () => {
    applyScenarioFromUrl();

    const t = new Date();
    if ($("inDate") && !$("inDate").value) $("inDate").value = dateToISO(t);
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";

    if ($("interestRatePct") && !$("interestRatePct").value) $("interestRatePct").value = "7.25";
    if ($("equityPct") && !$("equityPct").value) $("equityPct").value = "0";


    const irVals  = rangeValues({ start: 0.00, end: 25.00, step: 0.05, decimals: 2 });
    const cogVals = rangeValues({ start: 0.75, end: 1.50, step: 0.01, decimals: 2 });
    const dlVals  = rangeValues({ start: 0.0,  end: 100.0, step: 0.5,  decimals: 1 });
    const bVals   = rangeValues({ start: -100.0, end: 100.0, step: 1.0, decimals: 0 });
    const eqVals  = rangeValues({ start: 0.0,  end: 100.0, step: 1.0,  decimals: 0 });

    attachMobilePicker("interestRatePct", {
      title:"Interest Rate (%)",
      values: irVals,
      defaultValue: 7.25
    });

    attachMobilePicker("cogNoInterest", {
      title:"Projected COG",
      values: cogVals,
      defaultValue: 1.10
    });

    attachMobilePicker("deathLossPct", {
      title:"Death Loss (%)",
      values: dlVals,
      defaultValue: 1.0
    });

    attachMobilePicker("equityPct", {
      title:"Equity Contribution (%)",
      values: eqVals,
      defaultValue: 0
    });

    attachMobilePicker("basis", {
      title:"Expected Basis ($/cwt)",
      values: bVals,
      defaultValue: 0,
      normalize: normalizeBasisValue
    });

    const ids = [
      "inDate","daysOnFeed","adg","totalHead","ownershipPct","inWeight","priceCwt","outWeight",
      "cogNoInterest","deathLossPct","interestRatePct","equityPct","futures","basis"
    ];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => updateAll());
      el.addEventListener("change", () => updateAll());
    });

    $("resetBtn")?.addEventListener("click", resetAll);

    $("quickRunBtn")?.addEventListener("click", () => {
      quickRun = !quickRun;
      applyQuickRunUI();
      updateAll();
    });

    $("modeAdgBtn")?.addEventListener("click", () => {
      adgInputMode = true;
      applyDofAdgModeUI();
      updateAll();
    });

    $("modeDofBtn")?.addEventListener("click", () => {
      adgInputMode = false;
      applyDofAdgModeUI();
      updateAll();
    });

    $("equityExpanderToggle")?.addEventListener("click", () => {
      equityExpanderOpen = !equityExpanderOpen;
      applyEquityExpanderUI();
    });

    function wireInfoToggle(btnId, textId){
      $(btnId)?.addEventListener("click", () => {
        const txt = $(textId);
        const btn = $(btnId);
        if (!txt || !btn) return;
        const show = txt.classList.contains("hidden");
        txt.classList.toggle("hidden", !show);
        btn.setAttribute("aria-expanded", show ? "true" : "false");
      });
    }
    wireInfoToggle("plPerHdPerDayInfoBtn", "plPerHdPerDayInfoText");
    wireInfoToggle("cogInfoBtn", "cogInfoText");
    wireInfoToggle("contractsInfoBtn", "contractsTooltip");

    $("downloadPdfBtn")?.addEventListener("click", downloadPdf);
    $("shareScenarioBtn")?.addEventListener("click", shareScenario);

    $("detailsPanel")?.addEventListener("toggle", () => updateResultsSticky());
    window.addEventListener("resize", () => { updateResultsSticky(); fitBigValues(); });

    applyQuickRunUI();
    applyDofAdgModeUI();
    applyEquityExpanderUI();
    updateAll();
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      resolveEquityPct,
      computeFinancing,
      computeCostBreakdown,
      computeReturns,
      computePlPerHdPerDay,
      irrTwoPoint,
      fmtPctShort,
      // DOM-driving functions, exposed for integration tests against a
      // fake document (see tests/fake-dom.js). Never referenced by any
      // browser code path — safe to include here unconditionally.
      updateAll,
      resetAll,
      applyScenarioFromUrl,
      buildScenarioUrl
    };
  }

})();
