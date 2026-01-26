(function () {
  const $ = (id) => document.getElementById(id);

  function num(id) {
    const v = Number($(id).value);
    if (!isFinite(v)) throw new Error(`Missing/invalid: ${id}`);
    return v;
  }

  function dateVal(id) {
    const s = $(id).value;
    if (!s) throw new Error(`Missing/invalid: ${id}`);
    const d = new Date(s + "T00:00:00");
    if (isNaN(d.getTime())) throw new Error(`Missing/invalid: ${id}`);
    return d;
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

  function moneyPerCwt(x) { return isFinite(x) ? `${money(x)} /cwt` : "—"; }
  function moneyPerHd(x) { return isFinite(x) ? `${money(x)} /hd` : "—"; }

  function setText(id, v) { $(id).textContent = v; }

  function clearError() { setText("errorText", ""); }
  function showError(msg) { setText("errorText", msg); }

  function calculate() {
    // Inputs
    const inDate = dateVal("inDate");
    const daysOnFeed = num("daysOnFeed");
    const interestRate = num("interestRate");   // decimal (e.g., 0.0725)
    const deathLossPct = num("deathLossPct");   // decimal (e.g., 0.01)

    const inWeight = num("inWeight");           // lb
    const outWeight = num("outWeight");         // lb
    const priceCwt = num("priceCwt");           // $/cwt
    const cogNoInterest = num("cogNoInterest"); // $/lb gain

    const futures = num("futures");             // $/cwt
    const basis = num("basis");                 // $/cwt

    // Guardrails
    if (daysOnFeed <= 0) throw new Error("Days on Feed must be > 0.");
    if (inWeight <= 0 || outWeight <= 0) throw new Error("Weights must be > 0.");
    const gained = outWeight - inWeight;
    if (gained <= 0) throw new Error("Out Weight must be greater than In Weight.");

    // Spreadsheet-equivalent calculations
    const costPerHd = (inWeight * priceCwt) / 100.0;          // purchase cost/hd
    const costOfDeads = deathLossPct * costPerHd;              // dead loss $/hd
    const feedCost = gained * cogNoInterest;                   // feed $/hd
    const perHdCOG = feedCost + costOfDeads;                   // COG incl deads

    const interestPerHd = (((costPerHd + (0.5 * perHdCOG)) * interestRate) / 365.0) * daysOnFeed;

    const breakEvenCwt = ((interestPerHd + perHdCOG + costPerHd) / outWeight) * 100.0;

    const salesPrice = futures + basis;
    const plPerCwt = salesPrice - breakEvenCwt;
    const plPerHd = (plPerCwt * outWeight) / 100.0;

    const outDate = addDays(inDate, daysOnFeed);

    // Output
    setText("breakEvenCwt", moneyPerCwt(breakEvenCwt));
    setText("salesPrice", moneyPerCwt(salesPrice));
    setText("plPerCwt", moneyPerCwt(plPerCwt));
    setText("plPerHd", moneyPerHd(plPerHd));
    setText("outDate", outDate.toLocaleDateString());

    // Details (optional)
    setText("details",
      `Cost/hd: ${money(costPerHd)} • COG/hd (incl deads): ${money(perHdCOG)} • Interest/hd: ${money(interestPerHd)}`
    );
  }

  function reset() {
    ["inDate","daysOnFeed","interestRate","deathLossPct","inWeight","outWeight","priceCwt","cogNoInterest","futures","basis"]
      .forEach(id => $(id).value = "");
    ["breakEvenCwt","salesPrice","plPerCwt","plPerHd","outDate","details"].forEach(id => setText(id, "—"));
    clearError();
  }

  window.addEventListener("DOMContentLoaded", () => {
    $("calcBtn").addEventListener("click", () => {
      clearError();
      try { calculate(); } catch (e) { showError(e.message || "Calculation error."); }
    });

    $("resetBtn").addEventListener("click", reset);

    // Optional: prefill today's date for convenience
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    $("inDate").value = `${yyyy}-${mm}-${dd}`;
  });
})();
