(function () {
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  // ===================== State =====================
  let quickRun = false;

  // ===================== Formatting =====================
  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const moneyPerCwt = (x) => isFinite(x) ? `${money(x)} /cwt` : "—";
  const moneyPerHd  = (x) => isFinite(x) ? `${money(x)} /hd` : "—";
  const pct         = (x) => isFinite(x) ? (x * 100).toFixed(2) + "%" : "—";
  const fmtNum      = (x, d=2) => isFinite(x) ? Number(x).toFixed(d) : "—";

  // For PDF: currency w/out label
  const moneyPlain = (x) => isFinite(x) ? money(x) : "—";

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

  function clearError(){ setText("errorText",""); }
  function softError(msg){ setText("errorText", msg || ""); }

  // ===================== Status coloring =====================
  function applyStatus(plPerHd){
    const tiles = [$("tilePlPerCwt"), $("tilePlPerHd"), $("tileTotalPL")].filter(Boolean);
    tiles.forEach(t => t.classList.remove("good","mid","bad"));
    if (!isFinite(plPerHd)) return;
    const cls = (plPerHd >= 50) ? "good" : (plPerHd >= -25 ? "mid" : "bad");
    tiles.forEach(t => t.classList.add(cls));
  }

  // ===================== Derived fields =====================
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

  function updateHeadOwnedTip(){
    const tipWrap = $("wrapHeadOwnedTip");
    const tipVal = $("headOwnedTip");
    if (!tipWrap || !tipVal) return;

    if (quickRun) {
      tipWrap.classList.add("hidden");
      tipVal.textContent = "—";
      setText("d_myHead", "—");
      return;
    }

    tipWrap.classList.remove("hidden");

    const totalHead = numOrNaN("totalHead");
    const ownershipPct = numOrNaN("ownershipPct");

    if (isFinite(totalHead) && totalHead > 0 && isFinite(ownershipPct) && ownershipPct >= 0) {
      const myHead = totalHead * (ownershipPct / 100.0);
      const txt = myHead.toLocaleString(undefined, { maximumFractionDigits: 2 });
      tipVal.textContent = txt;
      setText("d_myHead", txt);
    } else {
      tipVal.textContent = "—";
      setText("d_myHead", "—");
    }
  }

  // ===================== UI toggles =====================
  function applyQuickRunUI(){
    const btn = $("quickRunBtn");
    if (btn) {
      btn.textContent = `Quick Run: ${quickRun ? "ON" : "OFF"}`;
      btn.setAttribute("data-on", quickRun ? "true" : "false");
    }

    // Hide inputs (interest stays visible in BOTH modes)
    $("wrapTotalHead")?.classList.toggle("hidden", quickRun);
    $("wrapOwnershipPct")?.classList.toggle("hidden", quickRun);

    // Head owned tooltip hidden in quick run
    $("wrapHeadOwnedTip")?.classList.toggle("hidden", quickRun);

    // Results visibility:
    // Quick Run should show: P/L per head, P/L per cwt, Break-even, Sales price
    // Full mode shows everything.
    const hide = (id, shouldHide) => { const el = $(id); if (el) el.classList.toggle("hidden", shouldHide); };

    hide("tileTotalPL", quickRun);
    hide("tileCapitalInvested", quickRun);
    hide("tileCattleSales", quickRun);
    hide("tileRoe", quickRun);
    hide("tileAnnualRoe", quickRun);
    hide("tileIrr", quickRun);
    $("detailsPanel")?.classList.toggle("hidden", quickRun);
  }

  // ===================== Outputs reset =====================
  function resetOutputs(){
    [
      "plPerHd","projectedTotalPL","plPerCwt","breakEvenCwt","salesPrice",
      "capitalInvested","cattleSales","roe","annualRoe","irr",
      "d_costPerHd","d_deadLossDollars","d_feedCost","d_perHdCOG","d_interestPerHd",
      "d_totalCostPerHd","d_salesPerHd","d_equityBase","d_myHead"
    ].forEach(id => setText(id, "—"));
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
  // Returns a “calc snapshot” used for PDF + share.
  function updateAll(){
    clearError();

    updateADG();
    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateInline();
    updateHeadOwnedTip();

    // Equity fixed 30%
    const equityUsed = 0.30;

    // Inputs
    const daysOnFeed = numOrNaN("daysOnFeed");
    const interestRatePct = numOrNaN("interestRatePct"); // included in BOTH modes
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
      return null;
    }
    if (isFinite(inWeight) && isFinite(outWeight) && inWeight > 0 && outWeight > 0 && outWeight <= inWeight) {
      softError("Out Weight must be greater than In Weight.");
      resetOutputs(); applyStatus(NaN);
      return null;
    }

    const haveCore =
      isFinite(daysOnFeed) && daysOnFeed > 0 &&
      isFinite(interestRate) && interestRate >= 0 &&
      isFinite(deathLoss) && deathLoss >= 0 &&
      isFinite(inWeight) && inWeight > 0 &&
      isFinite(priceCwt) &&
      isFinite(outWeight) && outWeight > 0 &&
      isFinite(cogNoInterest);

    // Snapshot (for PDF/share)
    const snap = {
      quickRun,
      inDate, outDate,
      daysOnFeed,
      totalHead, ownershipPct: ownership*100,
      inWeight, outWeight, adg: Number(strOrEmpty("adg")) || NaN,
      priceCwt,
      cogNoInterest,
      deathLossPct,
      interestRatePct,
      futures, basis
    };

    if (!haveCore) {
      resetOutputs();
      if (isFinite(futures) && isFinite(basis)) setText("salesPrice", moneyPerCwt(futures + basis));
      applyStatus(NaN);
      return null;
    }

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

      // Clear full-mode outputs
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_salesPerHd","—");
      setText("d_equityBase","—");
      applyStatus(NaN);
      return null;
    }

    const salesPrice = futures + basis;
    const plPerCwt = salesPrice - breakEvenCwt;
    const plPerHd = (plPerCwt * outWeight) / 100.0;

    setText("salesPrice", moneyPerCwt(salesPrice));
    setText("plPerCwt", moneyPerCwt(plPerCwt));
    setText("plPerHd", moneyPerHd(plPerHd));

    const salesPerHd = (salesPrice * outWeight) / 100.0;
    setText("d_salesPerHd", money(salesPerHd));

    // Quick Run stops here (but still includes BE + Sale + PL/hd + PL/cwt)
    if (quickRun) {
      setText("projectedTotalPL","—");
      setText("capitalInvested","—");
      setText("cattleSales","—");
      setText("roe","—");
      setText("annualRoe","—");
      setText("irr","—");
      setText("d_equityBase","—");
      applyStatus(plPerHd);

      return {
        ...snap,
        breakEvenCwt, salesPrice, plPerCwt, plPerHd,
        costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd,
        salesPerHd,
        myHead: NaN,
        capitalInvested: NaN,
        cattleSales: NaN,
        projectedTotalPL: NaN,
        roe: NaN,
        annualRoe: NaN,
        irr: NaN
      };
    }

    // Totals (full mode)
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

      return {
        ...snap,
        breakEvenCwt, salesPrice, plPerCwt, plPerHd,
        costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd,
        salesPerHd,
        myHead: NaN,
        capitalInvested: NaN,
        cattleSales: NaN,
        projectedTotalPL: NaN,
        roe: NaN,
        annualRoe: NaN,
        irr: NaN
      };
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

    let irr = NaN;
    if (inDate && outDate) {
      irr = irrTwoPoint(-capitalInvested, cattleSales, inDate, outDate);
      setText("irr", pct(irr));
    } else {
      setText("irr","—");
    }

    applyStatus(plPerHd);

    return {
      ...snap,
      breakEvenCwt, salesPrice, plPerCwt, plPerHd,
      costPerHd, deadLossDollars, feedCost, perHdCOG, interestPerHd, totalCostPerHd,
      salesPerHd,
      myHead,
      capitalInvested,
      cattleSales,
      projectedTotalPL,
      roe,
      annualRoe,
      irr
    };
  }

  // ===================== Mobile wheel picker =====================
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

  // ===================== Scenario share =====================
  function buildScenarioUrl() {
    const p = new URLSearchParams();

    // Always store quickRun flag
    p.set("qr", quickRun ? "1" : "0");

    // Inputs
    const fields = [
      ["inDate","id"], ["daysOnFeed","dof"],
      ["totalHead","th"], ["ownershipPct","own"],
      ["inWeight","iw"], ["priceCwt","pp"], ["outWeight","ow"],
      ["cogNoInterest","cog"], ["deathLossPct","dl"],
      ["interestRatePct","ir"], ["futures","fut"], ["basis","bas"]
    ];

    for (const [id, key] of fields) {
      const v = strOrEmpty(id);
      if (v !== "") p.set(key, v);
    }

    const url = new URL(window.location.href);
    url.search = p.toString();
    return url.toString();
  }

  async function shareScenario() {
    const url = buildScenarioUrl();
    const title = "CMS Breakeven Scenario";
    const text = "Here’s a CMS breakeven scenario link.";

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      // fall through to clipboard
    }

    try {
      await navigator.clipboard.writeText(url);
      alert("Scenario link copied to clipboard.");
    } catch (e) {
      prompt("Copy this scenario link:", url);
    }
  }

  function applyScenarioFromUrl() {
    const p = new URLSearchParams(window.location.search);
    if (!p || [...p.keys()].length === 0) return;

    quickRun = p.get("qr") === "1";

    const map = [
      ["inDate","id"], ["daysOnFeed","dof"],
      ["totalHead","th"], ["ownershipPct","own"],
      ["inWeight","iw"], ["priceCwt","pp"], ["outWeight","ow"],
      ["cogNoInterest","cog"], ["deathLossPct","dl"],
      ["interestRatePct","ir"], ["futures","fut"], ["basis","bas"]
    ];

    for (const [id, key] of map) {
      const v = p.get(key);
      if (v !== null && $(id)) $(id).value = v;
    }
  }

  // ===================== PDF (Executive One-Page) =====================
  function sanitizeFilename(name) {
    return String(name).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  }

  function niceDate(d) {
    if (!d || isNaN(d.getTime())) return "—";
    // Example: Feb 5, 2026
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  }

  function downloadPdf() {
    const calc = updateAll(); // ensure latest
    const scenario = prompt("Scenario name for this PDF?");
    if (scenario === null) return;

    const title = sanitizeFilename(scenario) || "Scenario";

    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      alert("PDF library not loaded. Check the jsPDF script tag / connection.");
      return;
    }

    // Recompute snapshot if updateAll returned null (still allow PDF with partials)
    const inDate = parseDateOrNull("inDate");
    const outDate = parseDateOrNull("inDate") && isFinite(numOrNaN("daysOnFeed")) ? addDays(parseDateOrNull("inDate"), numOrNaN("daysOnFeed")) : null;

    const safe = (v) => (v === undefined || v === null || v === "" ? "—" : String(v));

    // Pull rendered values (already formatted) where possible
    const v_plHd = $("plPerHd")?.textContent || "—";
    const v_totalPL = $("projectedTotalPL")?.textContent || "—";
    const v_be = $("breakEvenCwt")?.textContent || "—";
    const v_sale = $("salesPrice")?.textContent || "—";

    const v_roe = $("roe")?.textContent || "—";
    const v_aroe = $("annualRoe")?.textContent || "—";
    const v_irr = $("irr")?.textContent || "—";

    const v_cap = $("capitalInvested")?.textContent || "—";
    const v_sales = $("cattleSales")?.textContent || "—";

    // Net margin / cwt = P/L per cwt (already formatted as $x /cwt)
    const v_margin = $("plPerCwt")?.textContent || "—";

    const v_dof = safe(strOrEmpty("daysOnFeed"));
    const v_headOwned = quickRun ? "—" : ($("headOwnedTip")?.textContent || "—");

    // Inputs for bottom section
    const i_inWt = safe(strOrEmpty("inWeight")) + " lb";
    const i_outWt = safe(strOrEmpty("outWeight")) + " lb";
    const i_adg = safe(strOrEmpty("adg"));
    const i_dl = safe(strOrEmpty("deathLossPct")) + "%";

    const i_purchase = safe(strOrEmpty("priceCwt")) + " / cwt";
    const i_cog = safe(strOrEmpty("cogNoInterest")) + " / lb gain";
    const i_fut = safe(strOrEmpty("futures")) + " / cwt";
    const i_bas = safe(strOrEmpty("basis")) + " / cwt";

    const i_ir = safe(strOrEmpty("interestRatePct")) + "%";

    // ----- PDF drawing -----
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612, H = 792;
    const margin = 42;

    const cmsBlue = [51, 102, 153];
    const muted = [107, 114, 128];
    const ink = [15, 23, 42];

    // Helper: set text color quickly
    const tc = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

    // Background is white by default.

    // 1) Header bar
    doc.setFillColor(cmsBlue[0], cmsBlue[1], cmsBlue[2]);
    doc.rect(0, 0, W, 34, "F");

    // Title stack
    let y = 34 + 18;
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    tc(ink); doc.text("CMS Breakeven Calculator", margin, y);

    y += 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    tc(muted); doc.text("Lot Economics Summary", margin, y);

    // Header meta row (muted)
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    tc(muted);

    const leftX = margin;
    const rightX = margin + 260;

    doc.text(`In Date: `, leftX, y);
    doc.setFont("helvetica", "bold"); tc(ink);
    doc.text(niceDate(inDate), leftX + 44, y);

    doc.setFont("helvetica", "normal"); tc(muted);
    doc.text(`Out Date: `, rightX, y);
    doc.setFont("helvetica", "bold"); tc(ink);
    doc.text(niceDate(outDate), rightX + 50, y);

    y += 16;
    doc.setFont("helvetica", "normal"); tc(muted);
    doc.text(`Days on Feed: `, leftX, y);
    doc.setFont("helvetica", "bold"); tc(ink);
    doc.text(v_dof, leftX + 72, y);

    doc.setFont("helvetica", "normal"); tc(muted);
    doc.text(`Head Owned: `, rightX, y);
    doc.setFont("helvetica", "bold"); tc(ink);
    doc.text(safe(v_headOwned), rightX + 66, y);

    // 2) Results Snapshot (two big cards)
    y += 18;

    const cardGap = 12;
    const cardW = (W - margin*2 - cardGap) / 2;
    const cardH = 118;
    const cardY = y;

    function card(x, y, w, h) {
      doc.setDrawColor(219, 227, 239);
      doc.setFillColor(255,255,255);
      doc.roundedRect(x, y, w, h, 12, 12, "FD");
    }
    function label(x, y, txt) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      tc(muted);
      doc.text(txt, x, y);
    }

    const c1x = margin;
    const c2x = margin + cardW + cardGap;
    card(c1x, cardY, cardW, cardH);
    card(c2x, cardY, cardW, cardH);

    // Left card: PL/Head big, Total PL
    doc.setFont("helvetica", "bold"); doc.setFontSize(28); tc(ink);
    doc.text(v_plHd.replace(" /hd",""), c1x + 14, cardY + 42);
    label(c1x + 14, cardY + 60, "P/L PER HEAD");

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); tc(ink);
    doc.text(quickRun ? "—" : v_totalPL, c1x + 14, cardY + 90);
    label(c1x + 14, cardY + 106, "TOTAL P/L");

    // Right card: Break-even, Sale
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); tc(ink);
    doc.text(v_be, c2x + 14, cardY + 44);
    label(c2x + 14, cardY + 60, "BREAK-EVEN");

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); tc(ink);
    doc.text(v_sale, c2x + 14, cardY + 92);
    label(c2x + 14, cardY + 106, "PROJECTED SALE");

    y = cardY + cardH + 14;

    // 3) Performance Metrics Row
    const perfH = 54;
    const perfY = y;
    const perfGap = 10;
    const perfW = (W - margin*2 - perfGap*2) / 3;

    function smallCard(x,y,w,h){
      doc.setDrawColor(219, 227, 239);
      doc.setFillColor(255,255,255);
      doc.roundedRect(x,y,w,h,10,10,"FD");
    }

    const p1x = margin;
    const p2x = margin + perfW + perfGap;
    const p3x = margin + (perfW + perfGap)*2;

    smallCard(p1x, perfY, perfW, perfH);
    smallCard(p2x, perfY, perfW, perfH);
    smallCard(p3x, perfY, perfW, perfH);

    doc.setFont("helvetica","bold"); doc.setFontSize(10); tc(muted);
    doc.text("ROE", p1x + 10, perfY + 18);
    doc.text("ANNUALIZED ROE", p2x + 10, perfY + 18);
    doc.text("IRR", p3x + 10, perfY + 18);

    doc.setFont("helvetica","bold"); doc.setFontSize(14); tc(ink);
    doc.text(quickRun ? "—" : v_roe,  p1x + 10, perfY + 40);
    doc.text(quickRun ? "—" : v_aroe, p2x + 10, perfY + 40);
    doc.text(quickRun ? "—" : v_irr,  p3x + 10, perfY + 40);

    y = perfY + perfH + 14;

    // 4) Cost & Capital Summary (condensed)
    const ccY = y;
    const ccH = 74;
    card(margin, ccY, W - margin*2, ccH);

    doc.setFont("helvetica","bold"); doc.setFontSize(10); tc(muted);
    doc.text("Capital Invested:", margin + 14, ccY + 24);
    doc.text("Cattle Sales:",    margin + 14, ccY + 44);
    doc.text("Net Margin / cwt:",margin + 14, ccY + 64);

    doc.setFont("helvetica","bold"); doc.setFontSize(12); tc(ink);
    const rightEdge = W - margin - 14;

    const capTxt = quickRun ? "—" : v_cap;
    const salesTxt = quickRun ? "—" : v_sales;

    doc.text(capTxt, rightEdge, ccY + 24, { align:"right" });
    doc.text(salesTxt, rightEdge, ccY + 44, { align:"right" });
    doc.text(v_margin, rightEdge, ccY + 64, { align:"right" });

    y = ccY + ccH + 14;

    // 5) Inputs (de-emphasized, grouped, two-column)
    doc.setFont("helvetica","bold"); doc.setFontSize(11); tc(muted);
    doc.text("Inputs", margin, y);
    y += 10;

    const boxW = (W - margin*2 - 12) / 2;
    const boxH = 96;
    const box1x = margin;
    const box2x = margin + boxW + 12;
    const boxY = y;

    // Weights & Performance box
    smallCard(box1x, boxY, boxW, boxH);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); tc(ink);
    doc.text("Weights & Performance", box1x + 10, boxY + 18);

    doc.setFont("helvetica","normal"); doc.setFontSize(10); tc(muted);
    const r1y = boxY + 36;
    const rowGap = 16;

    function kv(x,y,k,v){
      doc.setFont("helvetica","normal"); tc(muted); doc.text(k, x, y);
      doc.setFont("helvetica","bold"); tc(ink); doc.text(v, x + 86, y);
    }
    kv(box1x + 10, r1y + 0, "In Weight:", i_inWt);
    kv(box1x + 10, r1y + rowGap, "Out Weight:", i_outWt);
    kv(box1x + 10, r1y + rowGap*2, "ADG:", i_adg);
    kv(box1x + 10, r1y + rowGap*3, "Death Loss:", i_dl);

    // Pricing Assumptions box
    smallCard(box2x, boxY, boxW, boxH);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); tc(ink);
    doc.text("Pricing Assumptions", box2x + 10, boxY + 18);

    const r2y = boxY + 36;
    kv(box2x + 10, r2y + 0, "Purchase:", i_purchase);
    kv(box2x + 10, r2y + rowGap, "COG:", i_cog);
    kv(box2x + 10, r2y + rowGap*2, "Futures:", i_fut);
    kv(box2x + 10, r2y + rowGap*3, "Basis:", i_bas);

    y = boxY + boxH + 12;

    // Financing box (full width)
    smallCard(margin, y, W - margin*2, 48);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); tc(ink);
    doc.text("Financing", margin + 10, y + 18);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); tc(muted);
    doc.text("Interest Rate:", margin + 10, y + 36);
    doc.setFont("helvetica","bold"); tc(ink);
    doc.text(i_ir, margin + 92, y + 36);

    doc.save(`${title}.pdf`);
  }

  // ===================== Reset =====================
  function resetAll() {
    const clearIds = ["daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight","futures"];
    clearIds.forEach(id => { if ($(id)) $(id).value = ""; });

    const t = new Date();
    if ($("inDate")) $("inDate").value = dateToISO(t);

    if ($("ownershipPct")) $("ownershipPct").value = "100";

    // defaults
    if ($("interestRatePct")) $("interestRatePct").value = "7.25";
    if ($("cogNoInterest")) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct")) $("deathLossPct").value = "1.0";
    if ($("basis")) $("basis").value = "0.0";

    if ($("adg")) $("adg").value = "—";
    if ($("outDateInline")) $("outDateInline").value = "—";

    clearError();
    resetOutputs();
    applyStatus(NaN);
    updateAll();
  }

  // ===================== Init =====================
  window.addEventListener("DOMContentLoaded", () => {
    // Apply scenario from URL first (so defaults don’t overwrite it)
    applyScenarioFromUrl();

    // Defaults if empty
    const t = new Date();
    if ($("inDate") && !$("inDate").value) $("inDate").value = dateToISO(t);
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";

    if ($("interestRatePct") && !$("interestRatePct").value) $("interestRatePct").value = "7.25";
    if ($("cogNoInterest") && !$("cogNoInterest").value) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct") && !$("deathLossPct").value) $("deathLossPct").value = "1.0";
    if ($("basis") && !$("basis").value) $("basis").value = "0.0";

    // Mobile pickers
    // Interest: 0–25 in 0.05 steps (2 decimals)
    const irVals  = rangeValues({ start: 0.00, end: 25.00, step: 0.05, decimals: 2 });
    const cogVals = rangeValues({ start: 0.75, end: 1.50, step: 0.01, decimals: 2 });
    const dlVals  = rangeValues({ start: 0.0,  end: 100.0, step: 0.5,  decimals: 1 });
    const bVals   = rangeValues({ start: -100.0, end: 100.0, step: 0.5, decimals: 1 });

    attachMobilePicker("interestRatePct", { title:"Interest Rate (%)", values: irVals, defaultValue: 7.25 });
    attachMobilePicker("cogNoInterest",   { title:"Projected COG", values: cogVals, defaultValue: 1.10 });
    attachMobilePicker("deathLossPct",    { title:"Death Loss (%)", values: dlVals, defaultValue: 1.0 });
    attachMobilePicker("basis",           { title:"Expected Basis", values: bVals, defaultValue: 0.0 });

    // Auto-calc on inputs
    const ids = [
      "inDate","daysOnFeed","totalHead","ownershipPct","inWeight","priceCwt","outWeight",
      "cogNoInterest","deathLossPct","interestRatePct","futures","basis"
    ];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => updateAll());
      el.addEventListener("change", () => updateAll());
    });

    // Buttons
    $("resetBtn")?.addEventListener("click", resetAll);

    $("quickRunBtn")?.addEventListener("click", () => {
      quickRun = !quickRun;
      applyQuickRunUI();
      updateAll();
    });

    $("downloadPdfBtn")?.addEventListener("click", downloadPdf);

    $("shareScenarioBtn")?.addEventListener("click", shareScenario);

    // Apply quick run (in case URL set it)
    applyQuickRunUI();
    updateAll();
  });

})();
