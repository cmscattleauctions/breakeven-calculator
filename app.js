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

  function fmtNum(x, decimals = 2) {
    if (!isFinite(x)) return "—";
    return Number(x).toFixed(decimals);
  }

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
  }

  function resetTotalsOutputs() {
    setText("capitalInvested", "—");
    setText("cattleSales", "—");
    setText("projectedTotalPL", "—");
    setText("roe", "—");
    setText("annualRoe", "—");
    setText("irr", "—");

    setText("d_myHead", "—");
    setText("d_totalPLDetail", "—");
    setText("d_equityBase", "—");
  }

  function resetADG() {
    const el = $("adg");
    if (el) el.value = "—";
  }

  // Two-cashflow IRR (closed form)
  function irrTwoPoint(c0, c1, d0, d1) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const t = (d1 - d0) / msPerDay / 365.0;
    if (!(t > 0)) return NaN;

    // Solve: c0 + c1 / (1+r)^t = 0  => (1+r)^t = -c1/c0
    const ratio = -c1 / c0;
    if (ratio > 0) return Math.pow(ratio, 1 / t) - 1;
    return NaN;
  }

  // Out Date: compute immediately when inDate + DOF exist
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

  // ADG: (outWeight - inWeight) / daysOnFeed
  function updateADGOnly() {
    const daysOnFeed = numOrNaN("daysOnFeed");
    const inWeight = numOrNaN("inWeight");
    const outWeight = numOrNaN("outWeight");

    const adgEl = $("adg");
    if (!adgEl) return;

    if (isFinite(daysOnFeed) && daysOnFeed > 0 && isFinite(inWeight) && isFinite(outWeight) && outWeight > inWeight) {
      const adg = (outWeight - inWeight) / daysOnFeed;
      adgEl.value = fmtNum(adg, 2);
    } else {
      adgEl.value = "—";
    }
  }

  function updateAll() {
    clearError();

    // Priority: Out Date + ADG first
    const inDate = parseDateOrNull("inDate");
    const outDate = updateOutDateOnly();
    updateADGOnly();

    // Inputs (percent fields)
    const daysOnFeed = numOrNaN("daysOnFeed");
    const interestRate = numOrNaN("interestRatePct") / 100.0; // 7.25 => 0.0725
    const deathLossPct = numOrNaN("deathLossPct") / 100.0;     // 1.00 => 0.01

    const totalHead = numOrNaN("totalHead");
    const ownership = numOrNaN("ownershipPct") / 100.0;        // 100 => 1.0
    const equityUsed = ((isFinite(numOrNaN("equityPct")) ? numOrNaN("equityPct") : 30) / 100.0);

    const inWeight = numOrNaN("inWeight");
    const priceCwt = numOrNaN("priceCwt");
    const outWeight = numOrNaN("outWeight");
    const cogNoInterest = numOrNaN("cogNoInterest");

    const futures = numOrNaN("futures");
    const basis = numOrNaN("basis");

    // Guardrails (soft)
    if (isFinite(daysOnFeed) && daysOnFeed < 0) {
      softError("Days on Feed must be > 0.");
      resetCoreOutputs();
      resetTotalsOutputs();
      return;
    }
    if (isFinite(inWeight) && inWeight < 0) {
      softError("In Weight cannot be negative.");
      resetCoreOutputs();
      resetTotalsOutputs();
      return;
    }
    if (isFinite(outWeight) && outWeight < 0) {
      softError("Out Weight cannot be negative.");
      resetCoreOutputs();
      resetTotalsOutputs();
      return;
    }
    if (isFinite(inWeight) && isFinite(outWeight) && inWeight > 0 && outWeight > 0 && outWeight <= inWeight) {
      softError("Out Weight must be greater than In Weight.");
      resetCoreOutputs();
      resetTotalsOutputs();
      return;
    }

    // Break-even prerequisites
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

      // Still show sales price if futures+basis exist
      if (isFinite(futures) && isFinite(basis)) {
        setText("salesPrice", moneyPerCwt(futures + basis));
      }
      return;
    }

    // Per-head math (sheet-aligned)
    const gained = outWeight - inWeight;

    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deadLossDollars = deathLossPct * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    const interestPerHd =
      (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

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

    // Sales-side prerequisites (futures+basis)
    const haveSalesSide = isFinite(futures) && isFinite(basis);
    if (!haveSalesSide) {
      setText("salesPrice", "—");
      setText("plPerCwt", "—");
      setText("plPerHd", "—");
      resetTotalsOutputs();
      setText("d_salesPerHd", "—");
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

    // Totals prerequisites (head + ownership)
    const haveTotals = isFinite(totalHead) && totalHead > 0 && isFinite(ownership) && ownership > 0;

    if (!haveTotals) {
      resetTotalsOutputs();
      return;
    }

    const myHead = totalHead * ownership;

    // Totals
    const capitalInvested = totalCostPerHd * myHead;
    const cattleSales = salesPerHd * myHead;
    const projectedTotalPL = plPerHd * myHead;

    setText("capitalInvested", money(capitalInvested));
    setText("cattleSales", money(cattleSales));
    setText("projectedTotalPL", money(projectedTotalPL));

    setText("d_myHead", myHead.toLocaleString(undefined, { maximumFractionDigits: 2 }));
    setText("d_totalPLDetail", money(projectedTotalPL));

    // ROE + Annualized ROE
    const equityBase = capitalInvested * equityUsed;
    setText("d_equityBase", money(equityBase));

    const roe = (equityBase !== 0) ? (projectedTotalPL / equityBase) : NaN;
    setText("roe", pct(roe));

    const years = (isFinite(daysOnFeed) && daysOnFeed > 0) ? (daysOnFeed / 365.0) : NaN;
    const annualRoe = (isFinite(roe) && isFinite(years) && years > 0) ? (Math.pow(1 + roe, 1 / years) - 1) : NaN;
    setText("annualRoe", pct(annualRoe));

    // IRR (two-point)
    if (inDate && outDate) {
      const irr = irrTwoPoint(-capitalInvested, cattleSales, inDate, outDate);
      setText("irr", pct(irr));
    } else {
      setText("irr", "—");
    }
  }

  function resetAll() {
    [
      "inDate","daysOnFeed","totalHead","ownershipPct","equityPct",
      "interestRatePct","deathLossPct",
      "inWeight","priceCwt","outWeight","cogNoInterest","futures","basis"
    ].forEach(id => { if ($(id)) $(id).value = ""; });

    // Prefill defaults
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if ($("inDate")) $("inDate").value = `${yyyy}-${mm}-${dd}`;

    if ($("interestRatePct")) $("interestRatePct").value = "7.25";
    if ($("deathLossPct")) $("deathLossPct").value = "1.00";
    if ($("ownershipPct")) $("ownershipPct").value = "100";
    if ($("equityPct")) $("equityPct").value = "30";

    clearError();
    resetADG();
    resetCoreOutputs();
    resetTotalsOutputs();
    updateOutDateOnly();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // Defaults (don’t overwrite if already populated)
    if ($("inDate") && !$("inDate").value) {
      const t = new Date();
      $("inDate").value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
    }
    if ($("interestRatePct") && !$("interestRatePct").value) $("interestRatePct").value = "7.25";
    if ($("deathLossPct") && !$("deathLossPct").value) $("deathLossPct").value = "1.00";
    if ($("ownershipPct") && !$("ownershipPct").value) $("ownershipPct").value = "100";
    if ($("equityPct") && !$("equityPct").value) $("equityPct").value = "30";

    // Auto-calc on every input
    const ids = [
      "inDate","daysOnFeed","totalHead","ownershipPct","equityPct",
      "interestRatePct","deathLossPct",
      "inWeight","priceCwt","outWeight","cogNoInterest","futures","basis"
    ];
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", updateAll);
      el.addEventListener("change", updateAll);
    });

    $("resetBtn")?.addEventListener("click", resetAll);

    // Initial render
    updateAll();
  });
})();
