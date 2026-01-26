(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }

  function getRaw(id) {
    const el = $(id);
    return el ? String(el.value ?? "").trim() : "";
  }

  function getNumOrNaN(id) {
    const raw = getRaw(id);
    if (raw === "") return NaN;
    const v = Number(raw);
    return isFinite(v) ? v : NaN;
  }

  function requireNum(id, label) {
    const v = getNumOrNaN(id);
    if (!isFinite(v)) throw new Error(`Missing/invalid: ${label}`);
    return v;
  }

  function parseDateOrNull(id) {
    const s = getRaw(id);
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function addDays(d, days) {
    const out = new Date(d);
    out.setDate(out.getDate() + Number(days));
    return out;
  }

  function money(x) {
    if (!isFinite(x)) return "—";
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyPerCwt(x) {
    return isFinite(x) ? `${money(x)} /cwt` : "—";
  }

  function moneyPerHd(x) {
    return isFinite(x) ? `${money(x)} /hd` : "—";
  }

  function clearError() { setText("errorText", ""); }
  function showError(msg) { setText("errorText", msg); }

  function resetOutputs() {
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
  }

  // Live-out-date update (no futures required)
  function updateOutDateLive() {
    const inDate = parseDateOrNull("inDate");
    const daysOnFeed = getNumOrNaN("daysOnFeed");

    if (inDate && isFinite(daysOnFeed) && daysOnFeed > 0) {
      const outDate = addDays(inDate, daysOnFeed);
      setText("outDate", outDate.toLocaleDateString());
    } else {
      setText("outDate", "—");
    }
  }

  function calculateFull() {
    // Required inputs for full calc
    const inDate = parseDateOrNull("inDate");
    if (!inDate) throw new Error("Missing/invalid: In Date");

    const daysOnFeed = requireNum("daysOnFeed", "Days on Feed");
    if (daysOnFeed <= 0) throw new Error("Days on Feed must be > 0.");

    const interestRatePct = requireNum("interestRatePct", "Interest Rate (%)");
    const interestRate = interestRatePct / 100.0;

    const deathLossPctInput = requireNum("deathLossPct", "Death Loss (%)");
    const deathLossPct = deathLossPctInput / 100.0;

    const inWeight = requireNum("inWeight", "In Weight (lb)");
    const priceCwt = requireNum("priceCwt", "Purchase Price ($/cwt)");
    const outWeight = requireNum("outWeight", "Out Weight (lb)");
    const cogNoInterest = requireNum("cogNoInterest", "Projected COG (no interest)");

    const futures = requireNum("futures", "Futures ($/cwt)");
    const basis = requireNum("basis", "Expected Basis ($/cwt)");

    if (inWeight <= 0 || outWeight <= 0) throw new Error("Weights must be > 0.");
    const gained = outWeight - inWeight;
    if (gained <= 0) throw new Error("Out Weight must be greater than In Weight.");

    // Spreadsheet-equivalent calculations (per head)
    const costPerHd = (inWeight * priceCwt) / 100.0;
    const deadLossDollars = deathLossPct * costPerHd;
    const feedCost = gained * cogNoInterest;
    const perHdCOG = feedCost + deadLossDollars;

    const interestPerHd = (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

    const breakEvenCwt = ((interestPerHd + perHdCOG + costPerHd) / outWeight) * 100.0;

    const salesPrice = futures + basis;
    const plPerCwt = salesPrice - breakEvenCwt;
    const plPerHd = (plPerCwt * outWeight) / 100.0;

    const totalCostPerHd = costPerHd + perHdCOG + interestPerHd;

    // Outputs
    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));
    setText("salesPrice", moneyPerCwt(salesPrice));
    setText("plPerCwt", moneyPerCwt(plPerCwt));
    setText("plPerHd", moneyPerHd(plPerHd));

    // Details
    setText("d_costPerHd", money(costPerHd));
    setText("d_deadLossDollars", money(deadLossDollars));
    setText("d_feedCost", money(feedCost));
    setText("d_perHdCOG", money(perHdCOG));
    setText("d_interestPerHd", money(interestPerHd));
    setText("d_totalCostPerHd", money(totalCostPerHd));
  }

  function resetAll() {
    [
      "inDate","daysOnFeed","interestRatePct","deathLossPct","inWeight","priceCwt",
      "outWeight","cogNoInterest","futures","basis"
    ].forEach(id => { if ($(id)) $(id).value = ""; });

    // Prefill convenience defaults
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if ($("inDate")) $("inDate").value = `${yyyy}-${mm}-${dd}`;

    if ($("interestRatePct")) $("interestRatePct").value = "7.25"; // default suggestion
    if ($("deathLossPct")) $("deathLossPct").value = "1.00";       // common default; change as desired

    clearError();
    resetOutputs();
    updateOutDateLive();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // Prefill defaults on first load (without overwriting existing values)
    if (!$("inDate")?.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      $("inDate").value = `${yyyy}-${mm}-${dd}`;
    }
    if (!$("interestRatePct")?.value) $("interestRatePct").value = "7.25";
    if (!$("deathLossPct")?.value) $("deathLossPct").value = "1.00";

    // Live Out Date updates
    ["inDate", "daysOnFeed"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("input", updateOutDateLive);
      if (el) el.addEventListener("change", updateOutDateLive);
    });
    updateOutDateLive();

    $("calcBtn")?.addEventListener("click", () => {
      clearError();
      resetOutputs(); // keeps outDate, clears calculation outputs
      try {
        // Always update out date before full calc
        updateOutDateLive();
        calculateFull();
      } catch (e) {
        showError(e.message || "Calculation error.");
      }
    });

    $("resetBtn")?.addEventListener("click", resetAll);
  });
})();
