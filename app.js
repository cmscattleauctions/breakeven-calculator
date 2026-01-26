(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }

  // Formatting
  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyPerCwt(x) { return isFinite(x) ? `${money(x)} /cwt` : "—"; }
  function moneyPerHd(x) { return isFinite(x) ? `${money(x)} /hd` : "—"; }
  function pct(x) { return isFinite(x) ? (x * 100).toFixed(2) + "%" : "—"; }
  function fmtNum(x, decimals = 2) { return isFinite(x) ? Number(x).toFixed(decimals) : "—"; }

  // Parsing
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

  // Tile coloring based on P/L per head
  // GOOD >= +$50/hd, MID between -$25 and +$50, BAD < -$25
  function applyStatus(plPerHd) {
    const tiles = [$("tilePlPerCwt"), $("tilePlPerHd"), $("tileTotalPL")].filter(Boolean);
    tiles.forEach(t => t.classList.remove("good","mid","bad"));

    if (!isFinite(plPerHd)) return;

    const cls = (plPerHd >= 50) ? "good" : (plPerHd >= -25 ? "mid" : "bad");
    tiles.forEach(t => t.classList.add(cls));
  }

  // Reset outputs
  function resetCoreOutputs() {
    setText("breakEvenCwt", "—");
    setText("salesPrice", "—");
    setText("plPerCwt", "—");
    setText("plPerHd", "—");

    setText("d_costPerHd", "—");
    setText("d_deadLossDollars", "—");
    setText("d_feedCost", "—");
    setText("d_perHdCOG", "—");
    setText("d_interestPerHd", "—");
    setText("d_totalCostPerHd", "—");
    setText("d_salesPerHd", "—");
    setText("d_equityBase", "—");
  }

  function resetTotalsOutputs() {
    setText("capitalInvested", "—");
    setText("cattleSales", "—");
    setText("projectedTotalPL", "—");
    setText("roe", "—");
    setText("annualRoe", "—");
    setText("irr", "—");
    setText("d_myHead", "—");
  }

  function resetDerivedInputs() {
    const adgEl = $("adg");
    if (adgEl) adgEl.value = "—";
    const headOwnedEl = $("headOwned");
    if (headOwnedEl) headOwnedEl.value = "—";
  }

  // IRR (two-point)
  function irrTwoPoint(c0, c1, d0, d1) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const t = (d1 - d0) / msPerDay / 365.0;
    if (!(t > 0)) return NaN;
    const ratio = -c1 / c0;
    if (ratio > 0) return Math.pow(ratio, 1 / t) - 1;
    return NaN;
  }

  // Out Date
  function updateOutDateOnly() {
    const inDate = parseDateOrNull("inDate");
    const daysOnFeed = numOrNaN("daysOnFeed");

    if (inDate && isFinite(daysOnFeed) && daysOnFeed > 0) {
      const outDate = addDays(inDate, daysOnFeed);
      setText("outDate", outDate.toLocaleDateString());
      return outDate;
    }
    setText("outDate", "—");
    return null;
  }

  // ADG
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

  // Head owned display
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

  // Clamp helper
  function clamp(val, min, max) {
    if (!isFinite(val)) return val;
    return Math.min(max, Math.max(min, val));
  }

  // Make a number input “scrollable”: wheel/trackpad increments by step within min/max
  function enableScrollStep(id) {
    const el = $(id);
    if (!el) return;

    el.addEventListener("wheel", (e) => {
      // prevent the page from scrolling when the user intends to change the value
      e.preventDefault();

      const stepAttr = el.getAttribute("step");
      const step = stepAttr ? Number(stepAttr) : 1;

      const minAttr = el.getAttribute("min");
      const maxAttr = el.getAttribute("max");
      const min = (minAttr !== null) ? Number(minAttr) : -Infinity;
      const max = (maxAttr !== null) ? Number(maxAttr) : Infinity;

      const current = (el.value === "" ? 0 : Number(el.value));
      if (!isFinite(current)) return;

      // wheel down => increase? users typically expect wheel up increases; we'll do that:
      const direction = (e.deltaY < 0) ? 1 : -1; // up => +, down => -
      const next = clamp(current + direction * step, min, max);

      // fix floating point noise
      const decimals = (String(step).split(".")[1] || "").length;
      el.value = (decimals > 0) ? next.toFixed(decimals) : String(next);

      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, { passive: false });
  }

  function updateAll() {
    clearError();

    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateOnly();
    updateADGOnly();
    updateHeadOwnedOnly();

    // Equity fixed at 30%
    const equityUsed = 0.30;

    // Inputs
    const daysOnFeed = numOrNaN("daysOnFeed");
    const interestRate = numOrNaN("interestRatePct") / 100.0;

    const totalHead = numOrNaN("totalHead");
    const ownership = numOrNaN("ownershipPct") / 100.0;

    const inWeight = numOrNaN("inWeight");
    const priceCwt = numOrNaN("priceCwt");
    const outWeight = numOrNaN("outWeight");

    const cogNoInterest = numOrNaN("cogNoInterest");
    const deathLossPct = numOrNaN("deathLossPct") / 100.0;

    const futures = numOrNaN("futures");
    const basis = numOrNaN("basis");

    // Soft guardrails
    if (isFinite(daysOnFeed) && daysOnFeed < 0) {
      softError("Days on Feed must be > 0.");
      resetCoreOutputs(); resetTotalsOutputs(); applyStatus(NaN);
      return;
    }
    if (isFinite(inWeight) && isFinite(outWeight) && inWeight > 0 && outWeight > 0 && outWeight <= inWeight) {
      softError("Out Weight must be greater than In Weight.");
      resetCoreOutputs(); resetTotalsOutputs(); applyStatus(NaN);
      return;
    }

    // Core prereqs
    const haveCore =
      isFinite(daysOnFeed) && daysOnFeed > 0 &&
      isFinite(interestRate) && interestRate >= 0 &&
      isFinite(deathLossPct) && deathLossPct >= 0 &&
      isFinite(inWeight) && inWeight > 0 &&
      isFinite(priceCwt) &&
      isFinite(outWeight) && outWeight > 0 &&
      isFinite(cogNoInterest);

    if (!haveCore) {
      resetCoreOutputs();
      resetTotalsOutputs();
      applyStatus(NaN);

      if (isFinite(futures) && isFinite(basis)) {
        setText("salesPrice", moneyPerCwt(futures + basis));
      }
      return;
    }

    // Per-head math
    const gained = outWeight - inWeight;

    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deadLossDollars = deathLossPct * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    const interestPerHd = (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

    const totalCostPerHd = costPerHd + perHdCOG + interestPerHd;
    const breakEvenCwt = (totalCostPerHd / outWeight) * 100.0;

    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));

    // Details
    setText("d_costPerHd", money(costPerHd));
    setText("d_deadLossDollars", money(deadLossDollars));
    setText("d_feedCost", money(feedCost));
    setText("d_perHdCOG", money(perHdCOG));
    setText("d_interestPerHd", money(interestPerHd));
    setText("d_totalCostPerHd", money(totalCostPerHd));

    // Sales-side
    const haveSalesSide = isFinite(futures) && isFinite(basis);
    if (!haveSalesSide) {
      setText("salesPrice", "—");
      setText("plPerCwt", "—");
      setText("plPerHd", "—");
      resetTotalsOutputs();
      setText("d_salesPerHd", "—");
      setText("d_equityBase", "—");
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
      resetTotalsOutputs();
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

    setText("d_myHead", myHead.toLocaleString(undefined, { maximumFractionDigits: 2 }));

    // ROE / Annual ROE
    const equityBase = capitalInvested * equityUsed;
    setText("d_equityBase", money(equityBase));

    const roe = (equityBase !== 0) ? (projectedTotalPL / equityBase) : NaN;
    setText("roe", pct(roe));

    const years = daysOnFeed / 365.0;
    const annualRoe = (isFinite(roe) && years > 0) ? (Math.pow(1 + roe, 1 / years) - 1) : NaN;
    setText("annualRoe", pct(annualRoe));

    // IRR
    if (inDate && outDate) {
      const irr = irrTwoPoint(-capitalInvested, cattleSales, inDate, outDate);
      setText("irr", pct(irr));
    } else {
      setText("irr", "—");
    }

    applyStatus(plPerHd);
  }

  function resetAll() {
    // Set roller defaults explicitly
    if ($("cogNoInterest")) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct")) $("deathLossPct").value = "1.0";
    if ($("basis")) $("basis").value = "0";

    [
      "daysOnFeed","totalHead","ownershipPct","interestRatePct",
      "inWeight","priceCwt","outWeight","futures"
    ].forEach(id => { if ($(id)) $(id).value = ""; });

    // Defaults
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if ($("inDate")) $("inDate").value = `${yyyy}-${mm}-${dd}`;

    if ($("interestRatePct")) $("interestRatePct").value = "7.25";
    if ($("ownershipPct")) $("ownershipPct").value = "100";

    clearError();
    resetDerivedInputs();
    resetCoreOutputs();
    resetTotalsOutputs();
    updateOutDateOnly();
    applyStatus(NaN);
    updateAll();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // Defaults
    if ($("inDate") && !$("inDate").value) {
      const t = new Date();
      $("inDate").value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
    }
    if ($("interestRatePct") && !$("interestRatePct").value) $("interestRatePct").value = "7.25";
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";

    // Roller defaults
    if ($("cogNoInterest") && !$("cogNoInterest").value) $("cogNoInterest").value = "1.10";
    if ($("deathLossPct") && !$("deathLossPct").value) $("deathLossPct").value = "1.0";
    if ($("basis") && !$("basis").value) $("basis").value = "0";

    // Enable scroll-to-increment on these “rollers”
    enableScrollStep("cogNoInterest");
    enableScrollStep("deathLossPct");
    enableScrollStep("basis");

    // Auto-calc on changes
    const ids = [
      "inDate","daysOnFeed","totalHead","ownershipPct","interestRatePct",
      "inWeight","priceCwt","outWeight","futures",
      "cogNoInterest","deathLossPct","basis"
    ];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", updateAll);
      el.addEventListener("change", updateAll);
    });

    $("resetBtn")?.addEventListener("click", resetAll);

    updateAll();
  });
})();
